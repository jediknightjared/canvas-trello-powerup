var Promise = TrelloPowerUp.Promise;

console.log("Canvas Power-Up Loaded");

TrelloPowerUp.initialize({
  "show-settings": function (t, options) {
    return t.popup({
      title: "Custom Fields Settings",
      url: "/settings.html",
      height: 184
    });
  },
  "card-from-url": async function (t, options) {
    console.log("Running card-from-url function");
    const url = options.url;

    const urlRegex = /^https:\/\/(\w+)\.instructure\.com\/courses\/([0-9]+)\/assignments\/([0-9]+)$/;

    if (!urlRegex.test(url)) {
      console.log("Unmatching URL: ", url);
      throw t.NotHandled();
    }

    console.log("loading token");

    const token = await t.loadSecret("token");

    const [, domain, courseID, assignmentID] = urlRegex.exec(url);

    const fetchURL = `https://${domain}.instructure.com/api/v1/courses/${courseID}/assignments/${assignmentID}?access_token=${token}`;

    console.log("Fetching from canvas API");

    const response = await fetch(fetchURL);
    const data = await response.json();

    console.log(data); // debug

    return new Promise(function (resolve) {
      resolve({
        name: data.name,
        desc: "This Power-Up knows cool things about the attached url"
      });
    });
  }
});
