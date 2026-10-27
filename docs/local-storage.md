# Local S3 storage

Use SeaweedFS in Docker while developing spec 04. No AWS account or application
code change is needed: the existing S3 client signs requests to the configured
endpoint. The bucket is private; Niryat serves PDFs through its file-token route.

This follows the [official single-container setup](https://github.com/seaweedfs/seaweedfs/wiki/Quick-Start-with-weed-mini),
pinned to [SeaweedFS 4.48](https://github.com/seaweedfs/seaweedfs/releases/tag/4.48).

## Start storage

With Docker Desktop running Linux containers, run this once. The single-line
command works in PowerShell and POSIX shells:

```sh
docker run -d --name niryat-s3 --restart unless-stopped -p 127.0.0.1:8333:8333 -v niryat-s3-data:/data -e AWS_ACCESS_KEY_ID=niryat-local -e AWS_SECRET_ACCESS_KEY=niryat-local-dev-only -e S3_BUCKET=niryat chrislusf/seaweedfs:4.48 mini -dir=/data
```

The credentials above are public, development-only test values. Do not reuse them
for deployed storage. Only the S3 port is published, bound to this computer's
loopback address. PostgreSQL and its volume are separate.

Confirm the container is running:

```sh
docker ps --filter name=niryat-s3
docker logs --tail 50 niryat-s3
```

Expect status `Up` and startup logs for the S3 service and the `niryat` bucket.
The first start can take a few seconds after the container appears.

## Configure Niryat

Set these values yourself in the repository-root private `.env`. The coding
assistant must not read or edit that file.

```dotenv
FILE_STORAGE_URL=http://127.0.0.1:8333/niryat
FILE_STORAGE_ACCESS_KEY_ID=niryat-local
FILE_STORAGE_SECRET_ACCESS_KEY=niryat-local-dev-only
FILE_STORAGE_REGION=us-east-1
PUBLIC_APP_URL=http://localhost:3000
```

Include `/niryat` in `FILE_STORAGE_URL`: the client appends the object key to this
bucket URL. These settings assume the API runs on the host through `pnpm dev`.
Keep your existing database, encryption, session and sandbox PayPal settings.

Restart Niryat after changing configuration:

```sh
corepack pnpm dev
```

On restricted PowerShell, use `corepack.cmd pnpm dev`.

## Verify in the browser (user)

With database migrations applied, sign in at `http://localhost:3000`. Complete the
profile and an eligible US client, then open `http://localhost:3000/invoices`.
Issue a one-time invoice for `Software development`, SAC `998314`, USD `100.00`.

Expect status **Issued**, **Waiting for your approval**, and an **Open PDF** link
that loads the invoice. Refresh and reopen the PDF to confirm it is stored. This
step does not approve or send anything to PayPal.

The S3 endpoint requires signed requests; an unsigned browser request to port
8333 is not a PDF verification check. Use Niryat's **Open PDF** link instead.

## Stop and restart

```sh
docker stop niryat-s3
docker start niryat-s3
```

The named Docker volume `niryat-s3-data` preserves PDFs across container restarts.
After restarting storage, reopen an existing invoice's PDF to check persistence.
Do not delete this volume while retaining database invoice records that refer to
its files.

## Later deployment

Replace the `FILE_STORAGE_*` values with those of a hosted S3-compatible bucket
and set `PUBLIC_APP_URL` to the public web origin that serves `/api/files/:token`.
Existing local PDF objects need to be copied to the hosted bucket under the same
keys if their invoice records are retained. Stored PDF links also retain the
origin used when the invoice was issued; changing the environment alone does not
rewrite them.

For local sandbox testing from another computer, expose Niryat's web app through
an HTTPS tunnel and set `PUBLIC_APP_URL` to that web origin **before issuing** the
invoice. Keep the storage port private. The API webhook tunnel is a separate
P3-15 setup step.

This local setup has no configured storage encryption at rest. Use synthetic
sandbox data; deployed storage must supply the encryption required by the plan.
