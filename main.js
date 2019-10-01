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
        "status": 200 ,
        "statusText": "OK" ,
        "headers": {'Content-Type': 'text/plain'}
      })
    }
    userName = await userIDToName(userID, request.url);
    return fetch(webhook, {
      "method": "POST",
      "headers": {
        'Accept': 'application/json',
        'Content-Type': 'application/json'
      },
      "body": JSON.stringify({"text":`*${userName}* \n${text}`})
    });
  }

  console.log(`Expect event type to be message, found ${event.type}`);
  return new Response(`Expect event type to be message, found ${event.type}`, {
    "status": 200 ,
    "statusText": "OK" ,
    "headers": {'Content-Type': 'text/plain'}
  })
}

async function userIDToName(userID, requestURL) {
  const studentEventURL = await EVENT_URLS.get("studentEventURL");
  const mentorEventURL = await EVENT_URLS.get("mentorEventURL");
  let userName;
  // Determine if this request is from student or mentor event notifier
  if (requestURL == studentEventURL) {
    userName = await STUDENT_USERS.get(userID);
  } else if (requestURL == mentorEventURL)  {
    userName = await MENTOR_USERS.get(userID);
  }
  if (userName != '') {
    return userName
  }
  return `Can't find user name for ID ${userID}` 
}
