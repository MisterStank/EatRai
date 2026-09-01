// Package auth verifies Sign in with Apple / Google identity tokens and mints
// EatRai's own short-lived session JWTs.
package auth

import (
	"context"
	"crypto/rsa"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"math/big"
	"net/http"
	"sync"
	"time"

	"github.com/golang-jwt/jwt/v5"
)

func sha256Hex(s string) string {
	sum := sha256.Sum256([]byte(s))
	return hex.EncodeToString(sum[:])
}

func subtleCompare(a, b string) int {
	return subtle.ConstantTimeCompare([]byte(a), []byte(b))
}

type Identity struct {
	Provider      string
	Subject       string
	Email         string
	EmailVerified bool
	Name          string
}

var providers = map[string]struct {
	iss  []string
	jwks string
}{
	"google": {iss: []string{"https://accounts.google.com", "accounts.google.com"}, jwks: "https://www.googleapis.com/oauth2/v3/certs"},
	"apple":  {iss: []string{"https://appleid.apple.com"}, jwks: "https://appleid.apple.com/auth/keys"},
}

// Verifier validates provider ID tokens against cached JWKS.
type Verifier struct {
	// Audiences maps provider -> the set of acceptable `aud` values. A native
	// app commonly has several OAuth client IDs (iOS / Android / Web), and the
	// id_token's aud is whichever one initiated the request, so we accept any.
	Audiences map[string][]string
	HTTP      *http.Client
	// JWKSOverride replaces a provider's JWKS URL (tests / staging). Optional.
	JWKSOverride map[string]string

	mu    sync.Mutex
	cache map[string]cachedKeys
}

func (v *Verifier) jwksURL(provider, dflt string) string {
	if u, ok := v.JWKSOverride[provider]; ok {
		return u
	}
	return dflt
}

type cachedKeys struct {
	keys      map[string]*rsa.PublicKey
	refreshed time.Time
}

func NewVerifier(audiences map[string][]string) *Verifier {
	return &Verifier{Audiences: audiences, HTTP: &http.Client{Timeout: 5 * time.Second}, cache: map[string]cachedKeys{}}
}

// VerifyOpts carries optional extra checks.
type VerifyOpts struct {
	// RawNonce, if set, must hash (SHA-256, hex) to the token's `nonce` claim.
	// Apple Sign In should always send this; Google is optional.
	RawNonce string
}

// Verify checks a raw provider ID token and returns the identity it asserts.
func (v *Verifier) Verify(ctx context.Context, provider, rawToken string, opts VerifyOpts) (Identity, error) {
	p, ok := providers[provider]
	if !ok {
		return Identity{}, fmt.Errorf("unknown provider %q", provider)
	}
	auds := v.Audiences[provider]
	if len(auds) == 0 {
		return Identity{}, fmt.Errorf("no configured audience for %q", provider)
	}

	var claims struct {
		jwt.RegisteredClaims
		Email         string `json:"email"`
		EmailVerified any    `json:"email_verified"` // Apple sends "true"/"false" strings
		Name          string `json:"name"`
		Nonce         string `json:"nonce"`
	}
	// Signature + expiry are validated by the library; issuer and audience we
	// check by hand because both providers need a set, not a single value.
	_, err := jwt.ParseWithClaims(rawToken, &claims, func(t *jwt.Token) (any, error) {
		if t.Method.Alg() != "RS256" {
			return nil, errors.New("unexpected alg")
		}
		kid, _ := t.Header["kid"].(string)
		return v.key(ctx, provider, v.jwksURL(provider, p.jwks), kid)
	}, jwt.WithExpirationRequired())
	if err != nil {
		return Identity{}, fmt.Errorf("verify %s token: %w", provider, err)
	}

	if !contains(p.iss, claims.Issuer) {
		return Identity{}, fmt.Errorf("bad issuer %q", claims.Issuer)
	}
	if !anyAudience(claims.Audience, auds) {
		return Identity{}, fmt.Errorf("token audience %v not in %v", claims.Audience, auds)
	}
	if claims.Subject == "" {
		return Identity{}, errors.New("token missing sub")
	}
	// Nonce. Apple always round-trips one (as SHA-256 of the client's raw
	// value); Google/OIDC round-trips the raw value verbatim. Accept either
	// form so one code path serves both.
	if opts.RawNonce != "" {
		n := claims.Nonce
		if n == "" || (subtleCompare(n, opts.RawNonce) != 1 && subtleCompare(n, sha256Hex(opts.RawNonce)) != 1) {
			return Identity{}, errors.New("nonce mismatch")
		}
	} else if provider == "apple" && claims.Nonce != "" {
		return Identity{}, errors.New("apple token carries a nonce but none was supplied")
	}

	return Identity{
		Provider:      provider,
		Subject:       claims.Subject,
		Email:         claims.Email,
		EmailVerified: truthy(claims.EmailVerified),
		Name:          claims.Name,
	}, nil
}

func anyAudience(tokenAud jwt.ClaimStrings, allowed []string) bool {
	for _, a := range tokenAud {
		if contains(allowed, a) {
			return true
		}
	}
	return false
}

func contains(s []string, v string) bool {
	for _, x := range s {
		if x == v {
			return true
		}
	}
	return false
}

func truthy(v any) bool {
	switch t := v.(type) {
	case bool:
		return t
	case string:
		return t == "true"
	}
	return false
}

func (v *Verifier) key(ctx context.Context, provider, jwksURL, kid string) (*rsa.PublicKey, error) {
	v.mu.Lock()
	defer v.mu.Unlock()
	c := v.cache[provider]
	if k, ok := c.keys[kid]; ok && time.Since(c.refreshed) < time.Hour {
		return k, nil
	}
	keys, err := fetchJWKS(ctx, v.HTTP, jwksURL)
	if err != nil {
		return nil, err
	}
	v.cache[provider] = cachedKeys{keys: keys, refreshed: time.Now()}
	if k, ok := keys[kid]; ok {
		return k, nil
	}
	return nil, fmt.Errorf("kid %q not in JWKS", kid)
}

func fetchJWKS(ctx context.Context, hc *http.Client, url string) (map[string]*rsa.PublicKey, error) {
	req, _ := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	resp, err := hc.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	var doc struct {
		Keys []struct {
			Kid, N, E, Kty string
		} `json:"keys"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&doc); err != nil {
		return nil, err
	}
	out := map[string]*rsa.PublicKey{}
	for _, k := range doc.Keys {
		if k.Kty != "RSA" {
			continue
		}
		nb, err := base64.RawURLEncoding.DecodeString(k.N)
		if err != nil {
			continue
		}
		eb, err := base64.RawURLEncoding.DecodeString(k.E)
		if err != nil {
			continue
		}
		out[k.Kid] = &rsa.PublicKey{N: new(big.Int).SetBytes(nb), E: int(new(big.Int).SetBytes(eb).Int64())}
	}
	return out, nil
}

// --- our own session tokens ------------------------------------------

type Tokens struct {
	AccessToken  string `json:"accessToken"`
	RefreshToken string `json:"refreshToken"`
	ExpiresIn    int    `json:"expiresIn"`
}

type Issuer struct {
	Secret     []byte
	AccessTTL  time.Duration
	RefreshTTL time.Duration
}

func (i Issuer) Issue(userID string) (Tokens, error) {
	access, err := i.sign(userID, "access", i.AccessTTL)
	if err != nil {
		return Tokens{}, err
	}
	refresh, err := i.sign(userID, "refresh", i.RefreshTTL)
	if err != nil {
		return Tokens{}, err
	}
	return Tokens{AccessToken: access, RefreshToken: refresh, ExpiresIn: int(i.AccessTTL.Seconds())}, nil
}

func (i Issuer) sign(sub, typ string, ttl time.Duration) (string, error) {
	t := jwt.NewWithClaims(jwt.SigningMethodHS256, jwt.MapClaims{
		"sub": sub, "typ": typ,
		"iat": time.Now().Unix(),
		"exp": time.Now().Add(ttl).Unix(),
	})
	return t.SignedString(i.Secret)
}

// Parse validates one of our tokens and returns (subject, type).
func (i Issuer) Parse(raw string) (string, string, error) {
	var claims jwt.MapClaims
	_, err := jwt.ParseWithClaims(raw, &claims, func(*jwt.Token) (any, error) { return i.Secret, nil },
		jwt.WithValidMethods([]string{"HS256"}))
	if err != nil {
		return "", "", err
	}
	sub, _ := claims["sub"].(string)
	typ, _ := claims["typ"].(string)
	return sub, typ, nil
}
