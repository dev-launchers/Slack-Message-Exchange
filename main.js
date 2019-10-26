const uuidv4 = require('uuid/v4');

addEventListener('fetch', event => {
  event.respondWith(handleRequest(event.request))
})

/**
 * Fetch and log a request
 * @param {Request} request
 */
async function handleRequest(request) {
  const requestJSON = await request.json()
    .then(data => {
      return data;
    });

  var event = requestJSON.event;
  // If the message is posted via webhook, event.user is undefined
  // We can prevent replying a message we just post by checking if event.user is undefined
  if (event.type == 'message' && event.user) {
    const userID = event.user;
    const channel = event.channel;
    const text = event.text;
    const webhook = await CHANNELS_TO_WEBHOOK.get(channel);
    if (!webhook) {
      return new Response(`Webhook URL for channel ${channel} not found`, {
        "status": 200,
        "statusText": "OK",
        "headers": { 'Content-Type': 'text/plain' }
      })
    }
    userName = await userIDToName(userID, request.url);
    return fetch(webhook, {
      "method": "POST",
      "headers": {
        'Accept': 'application/json',
        'Content-Type': 'application/json'
      },
      "body": JSON.stringify({ "text": `*${userName}* \n${text}` })
    });
  }

  await sentryLog(JSON.stringify(event));
  return new Response(`Expect event type to be message, found ${event.type}`, {
    "status": 200,
    "statusText": "OK",
    "headers": { 'Content-Type': 'text/plain' }
  })
}

async function userIDToName(userID, requestURL) {
  const userName = USERS.get(userID);
  if (userName != '') {
    return userName
  }
  return `Can't find user name for ID ${userID}`
}

async function sentryLog(err) {
  const currentTimestamp = Date.now() / 1000;
  const body = sentryEventJson(err, currentTimestamp)
  const sentryProectID = await SLACK_BRIDGE.get("sentryProjectID");
  const sentryKey = await SLACK_BRIDGE.get("sentryKey");
  return await fetch(`https://sentry.io/api/${sentryProectID}/store/`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Sentry-Auth': [
        'Sentry sentry_version=7',
        `sentry_timestamp=${currentTimestamp}`,
        `sentry_client=slack-bridge/0`,
        `sentry_key=${sentryKey}`
      ].join(', '),
    },
    body,
  });
}

function sentryEventJson(err, currentTimestamp) {
  return JSON.stringify({
    event_id: uuidv4(),
    message: err,
    timestamp: currentTimestamp,
    logger: "slack-bridge-logger",
    platform: "javascript",
  })
}