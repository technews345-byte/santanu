#!/usr/bin/env sh
set -eu
for tier in pro standard; do
  curl -fL "https://fal.ai/api/openapi/queue/openapi.json?endpoint_id=fal-ai/kling-video/v3/$tier/motion-control" -o "provider-schema/fal-$tier.json"
done
npm run schema:types
