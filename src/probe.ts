const urlToFetch = "http://news.ycombinator.com";
const curlieUrl = "https://curlie.org";
const curlieRefDir = "https://curlie.org/Reference/Directories";
const curlieCompDir =
  "https://curlie.org/Computers/Internet/Searching/Directories";

async function generateResponse(url: string) {
  const request = new Request(url, { redirect: "manual" });

  try {
    let response = await fetch(request);
    let status: number = response.status;
    let location = response.headers.get("location");
    const responses: Response[] = [];
    responses.push(response);
    if (status >= 300 && status <= 400) {
      while (status >= 300 && status < 400) {
        if (typeof location === "string") {
          response = await fetch(location, { redirect: "manual" });
          responses.push(response);
          status = response.status;
          location = response.headers.get("location");
        }
      }
    }
    console.log(`Response data from ${url}: `, responses);
  } catch (error) {
    if (error instanceof Error) {
      console.log(error.message);
    } else {
      console.log(error);
    }
  }
}

await generateResponse(urlToFetch);
await generateResponse(curlieUrl);
await generateResponse(curlieRefDir);
await generateResponse(curlieCompDir);
