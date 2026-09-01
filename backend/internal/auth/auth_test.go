package auth

import (
	"context"
	"crypto/rand"
	"crypto/rsa"
	"encoding/base64"
	"encoding/json"
	"math/big"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/golang-jwt/jwt/v5"
)

func testJWKS(t *testing.T, key *rsa.PrivateKey, kid string) *httptest.Server {
	t.Helper()
	pub := key.Public().(*rsa.PublicKey)
	doc := map[string]any{"keys": []map[string]string{{
		"kty": "RSA", "kid": kid, "alg": "RS256", "use": "sig",
		"n": base64.RawURLEncoding.EncodeToString(pub.N.Bytes()),
		"e": base64.RawURLEncoding.EncodeToString(big.NewInt(int64(pub.E)).Bytes()),
	}}}
	return httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		_ = json.NewEncoder(w).Encode(doc)
	}))
}

func mint(t *testing.T, key *rsa.PrivateKey, kid string, claims jwt.MapClaims) string {
	t.Helper()
	tok := jwt.NewWithClaims(jwt.SigningMethodRS256, claims)
	tok.Header["kid"] = kid
	s, err := tok.SignedString(key)
	if err != nil {
		t.Fatal(err)
	}
	return s
}

func newVerifier(t *testing.T, provider, jwksURL string, auds []string) *Verifier {
	v := NewVerifier(map[string][]string{provider: auds})
	v.JWKSOverride = map[string]string{provider: jwksURL}
	return v
}

func TestVerifyGoogleHappyPath(t *testing.T) {
	key, _ := rsa.GenerateKey(rand.Reader, 2048)
	js := testJWKS(t, key, "k1")
	defer js.Close()
	v := newVerifier(t, "google", js.URL, []string{"web.example", "ios.example"})

	raw := mint(t, key, "k1", jwt.MapClaims{
		"iss":   "https://accounts.google.com",
		"aud":   "ios.example",
		"sub":   "google-123",
		"email": "a@b.com", "email_verified": true, "name": "Ada",
		"exp": time.Now().Add(time.Hour).Unix(),
	})
	id, err := v.Verify(context.Background(), "google", raw, VerifyOpts{})
	if err != nil {
		t.Fatalf("verify: %v", err)
	}
	if id.Subject != "google-123" || id.Email != "a@b.com" || !id.EmailVerified {
		t.Fatalf("bad identity: %+v", id)
	}
}

func TestVerifyRejectsWrongAudienceAndIssuer(t *testing.T) {
	key, _ := rsa.GenerateKey(rand.Reader, 2048)
	js := testJWKS(t, key, "k1")
	defer js.Close()
	v := newVerifier(t, "google", js.URL, []string{"web.example"})

	base := jwt.MapClaims{"iss": "https://accounts.google.com", "aud": "web.example", "sub": "x", "exp": time.Now().Add(time.Hour).Unix()}

	bad := jwt.MapClaims{}
	for k, val := range base {
		bad[k] = val
	}
	bad["aud"] = "attacker.example"
	if _, err := v.Verify(context.Background(), "google", mint(t, key, "k1", bad), VerifyOpts{}); err == nil {
		t.Fatal("expected wrong-audience rejection")
	}

	bad2 := jwt.MapClaims{}
	for k, val := range base {
		bad2[k] = val
	}
	bad2["iss"] = "https://evil.example"
	if _, err := v.Verify(context.Background(), "google", mint(t, key, "k1", bad2), VerifyOpts{}); err == nil {
		t.Fatal("expected wrong-issuer rejection")
	}
}

func TestVerifyRejectsExpiredAndBadSignature(t *testing.T) {
	key, _ := rsa.GenerateKey(rand.Reader, 2048)
	other, _ := rsa.GenerateKey(rand.Reader, 2048)
	js := testJWKS(t, key, "k1")
	defer js.Close()
	v := newVerifier(t, "apple", js.URL, []string{"app.eatrai.mobile"})

	expired := mint(t, key, "k1", jwt.MapClaims{
		"iss": "https://appleid.apple.com", "aud": "app.eatrai.mobile", "sub": "u",
		"exp": time.Now().Add(-time.Minute).Unix(),
	})
	if _, err := v.Verify(context.Background(), "apple", expired, VerifyOpts{}); err == nil {
		t.Fatal("expected expired rejection")
	}

	forged := mint(t, other, "k1", jwt.MapClaims{
		"iss": "https://appleid.apple.com", "aud": "app.eatrai.mobile", "sub": "u",
		"exp": time.Now().Add(time.Hour).Unix(),
	})
	if _, err := v.Verify(context.Background(), "apple", forged, VerifyOpts{}); err == nil {
		t.Fatal("expected bad-signature rejection")
	}
}

func TestVerifyAppleNonce(t *testing.T) {
	key, _ := rsa.GenerateKey(rand.Reader, 2048)
	js := testJWKS(t, key, "k1")
	defer js.Close()
	v := newVerifier(t, "apple", js.URL, []string{"app.eatrai.mobile"})

	rawNonce := "the-client-random"
	raw := mint(t, key, "k1", jwt.MapClaims{
		"iss": "https://appleid.apple.com", "aud": "app.eatrai.mobile", "sub": "u",
		"nonce": sha256Hex(rawNonce),
		"exp":   time.Now().Add(time.Hour).Unix(),
	})
	if _, err := v.Verify(context.Background(), "apple", raw, VerifyOpts{RawNonce: rawNonce}); err != nil {
		t.Fatalf("matching nonce should pass: %v", err)
	}
	if _, err := v.Verify(context.Background(), "apple", raw, VerifyOpts{RawNonce: "wrong"}); err == nil {
		t.Fatal("mismatched nonce must fail")
	}
	// token carries a nonce but caller supplied none -> still must fail
	if _, err := v.Verify(context.Background(), "apple", raw, VerifyOpts{}); err == nil {
		t.Fatal("token nonce present but unchecked must fail")
	}
}
