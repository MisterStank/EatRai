package snapshot

import (
	"context"
	"errors"
	"io"

	"cloud.google.com/go/storage"
)

// Bucket is a Store backed by a single object in a Cloud Storage bucket.
type Bucket struct {
	client *storage.Client
	bucket string
	object string
}

// NewBucket wraps an existing *storage.Client (share one across the process;
// don't create a new client per call). object is the blob name within
// bucket, e.g. "cache-snapshot.gob".
func NewBucket(client *storage.Client, bucket, object string) *Bucket {
	return &Bucket{client: client, bucket: bucket, object: object}
}

func (b *Bucket) Load(ctx context.Context) ([]byte, error) {
	r, err := b.client.Bucket(b.bucket).Object(b.object).NewReader(ctx)
	if err != nil {
		if errors.Is(err, storage.ErrObjectNotExist) {
			return nil, ErrNotFound
		}
		return nil, err
	}
	defer r.Close()
	return io.ReadAll(r)
}

func (b *Bucket) Save(ctx context.Context, data []byte) error {
	w := b.client.Bucket(b.bucket).Object(b.object).NewWriter(ctx)
	if _, err := w.Write(data); err != nil {
		_ = w.Close()
		return err
	}
	return w.Close()
}
