const urlToFetch = "http://news.ycombinator.com";

async function generateResponse(url: string) {
  try {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Response status: ${response.status}`);
    }
    console.log(response);
  } catch (error) {
    if (error instanceof Error) {
      console.log(error.message);
    } else {
      console.log(error);
    }
  }
}

generateResponse(urlToFetch);
