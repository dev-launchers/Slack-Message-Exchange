const uuidv4 = require('uuid/v4');
const Slack = require('slack');

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

  const event = requestJSON.event;
  switch (event.type) {
    case 'message':
      return handleMessage(event)
    case 'file_shared':
      return handleFileShared(event)
    default:
      console.log(`${event.type} not handled yet`);
      await sentryLog(event);
      return new Response(`${event.type} not handled yet`, {
        "status": 200,
        "statusText": "OK",
        "headers": { 'Content-Type': 'text/plain' }
      })
  }
}

async function handleMessage(event) {
  // If the message is posted via webhook, event.user is undefined.
  // We can prevent replying a message/sharing a file we just post by checking if event.user is undefined
  if (!event.user) {
    return respOk('message was not posted by a user')
  }

  // No need to share bot(relevant to each namespace) message
  if (event.subtype === "bot_message") {
    return respOk("don't share bot_message")
  }
  const text = event.text;
  // If there is no text, there is no reason to send it
  if (noText(text)) {
    return respOk('no text to share')
  }
  const webhook = JSON.parse(await CHANNELS_TO_WEBHOOK.get(event.channel)).webhook;
  const userName = await userIDToName(event.user);
  if (!webhook) {
    return respOk(`Webhook URL for channel ${channel} not found`)
  }
  return fetch(webhook, {
    "method": "POST",
    "headers": {
      'Accept': 'application/json',
      'Content-Type': 'application/json'
    },
    "body": JSON.stringify({ "text": `*${userName}* \n${text}` })
  });
}

/*
  {
    "event":{
      "type":"file_shared",
      "channel_id":"channelID",
      "file_id":"fileID",
      "user_id":"userID",
      "file":{"id":"fileID"},
      "event_ts":"1572122384.013800"
    }
  }
*/
async function handleFileShared(event) {
  if (!event.user_id) {
    return respOk('file was not shared by a user')
  }
  const userName = await userIDToName(event.user_id);
  if (isBot(userName)) {
    return respOk('do not reshare file')
  }
  const fileID = event.file_id;

  authToken = await SLACK_BRIDGE.get("authToken");
  peerAuthToken = await SLACK_BRIDGE.get("peerNamespaceAuthToken");
  peerBotToken = await SLACK_BRIDGE.get("peerNamespaceBotToken");

  let slackClient = new SlackClient(authToken, peerAuthToken, peerBotToken);
  let fileInfo = await slackClient.fileInfo(fileID);

  const peerChannel = JSON.parse(await CHANNELS_TO_WEBHOOK.get(event.channel_id)).channel;

  let uploadFileResp;
  if (fileInfo.content) {
    uploadFileResp = await slackClient.uploadFileToPeer(fileInfo, userName, peerChannel);
  } else {
    uploadFileResp = await slackClient.shareRemoteFileWithPeer(fileID, fileInfo, peerChannel);
  }

  const body = await uploadFileResp.json().then(data => {
    return data
  });

  if (!body.ok) {
    const err = `Failed to upload file ${body}`
    await sentryLog(err)
    return respOk(err)
  }

  return respOk('File shared')
}

function urlEncodedBody(params) {
  let body = [];
  for (let key in params) {
    var encodedKey = encodeURIComponent(key);
    var encodedValue = encodeURIComponent(params[key]);
    body.push(encodedKey + "=" + encodedValue);
  }
  return body.join("&")
}

async function userIDToName(userID) {
  const userName = await USERS.get(userID);
  if (userName != null) {
    return userName
  }
  return `New user ${userID}`
}

function isBot(userName) {
  return userName === "Bot"
}

function noText(text) {
  // First check if text is null or undefined, then check if text is empty.
  return text == null || text === ''
}

async function sentryLog(err) {
  const currentTimestamp = Date.now() / 1000;
  const body = sentryEventJson(err, currentTimestamp);
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
    message: JSON.stringify(err),
    timestamp: currentTimestamp,
    logger: "slack-bridge-logger",
    platform: "javascript",
  })
}

// Retrun 200 to slack, otherwise if failure rate is greater than %, slack 
function respOk(message) {
  return new Response(message, {
    "status": 200,
    "statusText": "OK",
    "headers": { 'Content-Type': 'text/plain' }
  })
}

class SlackClient {
  constructor(authToken, peerAuthToken, peerBotToken) {
    this.authToken = authToken;
    this.peerAuthToken = peerAuthToken;
    this.peerBotToken = peerBotToken;

    this.client = new Slack({ "token": authToken });
    this.peerClient = new Slack({ "token": peerAuthToken });
  }

  // https://api.slack.com/methods/files.info
  async fileInfo(fileID) {
    const fileInfo = await this.client.files.info({ "file": fileID });
    if (!fileInfo.ok) {
      const err = `Failed to get file info for ${file_id}, error ${file.error}`;
      await sentryLog(err);
      return respOk(err)
    }
    return fileInfo
  }

  // For uploading snipper/text
  async uploadFileToPeer(fileInfo, userName, peerChannel) {
    uploadFileResp = await this.peerClient.files.upload({
      "channels": peerChannel,
      "content": fileInfo.content,
      "filename": fileInfo.file.name,
      "filetype": fileInfo.file.filetype,
      "title": fileInfo.file.title,
      "initial_comment": `${userName} shared ${fileInfo.file.name}`
    })
    return uploadFileResp
  }

  // Adds and share remote file with a channel in the peer namespace
  async shareRemoteFileWithPeer(fileID, fileInfo, peerChannel) {
    // Remote file can only be added by bots
    const fileBaseURL = await SLACK_BRIDGE.get("fileBaseURL");
    // Add remote file
    const addRemoteFileResp = await fetch("https://slack.com/api/files.remote.add", {
      method: "POST",
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: urlEncodedBody({
        token: this.peerBotToken,
        external_id: fileID,
        external_url: `${fileBaseURL}/${fileID}/${fileInfo.file.name}`,
        title: fileInfo.file.title,
        filetype: fileInfo.file.filetype,
      })
    })
    if (addRemoteFileResp.status != 200) {
      const err = `Add remote file returned status ${addRemoteFileResp.status}`;
      await sentryLog(err);
      return respOk(err)
    }
    const body = await addRemoteFileResp.json().then(data => {
      return data
    });

    if (!body.ok) {
      const err = `Add remote file returned error ${body.error}`;
      await sentryLog(err);
      return respOk(err)
    }
    // Share remote file
    const uploadFileResp = await fetch("https://slack.com/api/files.remote.share", {
      method: "POST",
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: urlEncodedBody({
        token: this.peerBotToken,
        channels: peerChannel,
        external_id: fileID,
        file: body.file.id,
      })
    })
    return uploadFileResp
  }

}