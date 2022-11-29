# gh-pr-dashboard

```shell
echo "controls.js: $(cat docs/scripts/controls.js | openssl dgst -sha384 -binary | openssl base64 -A)";
echo "github.js: $(cat docs/scripts/github.js | openssl dgst -sha384 -binary | openssl base64 -A)";
```