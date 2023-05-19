var Promise = TrelloPowerUp.Promise;

console.log("Test");

TrelloPowerUp.initialize({
  "show-settings": function (t, options) {
    return t.popup({
      title: "Custom Fields Settings",
      url: "/settings.html",
      height: 184
    });
  },
  "card-from-url": function (t, options) {
    // options.url has the url in question
    // if we know cool things about that url we can give Trello a name and desc
    // to use when creating a card. Trello will also automatically add that url
    // as an attachment to the created card
    // As always you can return a Promise that resolves to the card details

    const url = options.url;

    console.log(url);

    return new Promise(function (resolve) {
      resolve({
        name: "💻 " + options.url + " 🤔",
        desc: "This Power-Up knows cool things about the attached url"
      });
    });

    // if we don't actually have any valuable information about the url
    // we can let Trello know like so:
    // throw t.NotHandled();
  }
});
