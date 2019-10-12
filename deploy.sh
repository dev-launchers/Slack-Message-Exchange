#!/bin/bash
# Replace variables in wrangler.toml with env vars defined in travis
sed -e "s~ACCOUNT_ID~$ACCOUNT_ID~" \
    -e "s~ZONE_ID~$ZONE_ID~" \
    -e "s~STUDENT_ROUTE~$STUDENT_ROUTE~" \
    -e "s~STUDENT_CHANNELS_TO_WEBHOOK_KV_NAMESPACES~$STUDENT_CHANNELS_TO_WEBHOOK_KV_NAMESPACES~" \
    -e "s~STUDENT_USERS_KV_NAMESPACES~$STUDENT_USERS_KV_NAMESPACES~" \
    -e "s~MENTOR_ROUTE~$MENTOR_ROUTE~" \
    -e "s~MENTOR_CHANNELS_TO_WEBHOOK_KV_NAMESPACES~$MENTOR_CHANNELS_TO_WEBHOOK_KV_NAMESPACES~" \
    -e "s~MENTOR_USERS_KV_NAMESPACES~$MENTOR_USERS_KV_NAMESPACES~" \
    wrangler.toml > templated_wrangler.toml
mv templated_wrangler.toml wrangler.toml
CF_API_KEY=$CF_API_KEY CF_EMAIL=$CF_EMAIL wrangler publish -e student
CF_API_KEY=$CF_API_KEY CF_EMAIL=$CF_EMAIL wrangler publish -e mentor