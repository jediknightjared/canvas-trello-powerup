var Promise = TrelloPowerUp.Promise;

TrelloPowerUp.initialize({
  "show-settings": function (t, options) {
    return t.popup({
      title: "Custom Fields Settings",
      url: "/settings.html",
      height: 184
    });
  },
  "card-from-url": async function (t, options) {
    const url = options.url;

    const urlRegex = /^https:\/\/(\w+)\.instructure\.com\/courses\/([0-9]+)\/assignments\/([0-9]+)$/;

    if (!urlRegex.test(url)) {
      throw t.NotHandled();
    }

    const token = await t.loadSecret("token");

    const [, domain, courseID, assignmentID] = urlRegex.exec(url);

    const fetchURL = `https://${domain}.instructure.com/api/v1/courses/${courseID}/assignments/${assignmentID}?access_token=${token}`;

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
