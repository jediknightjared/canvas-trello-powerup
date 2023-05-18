var Promise = TrelloPowerUp.Promise;

console.log("Test");

TrelloPowerUp.initialize({
  "show-settings": function (t, options) {
    // when a user clicks the gear icon by your Power-Up in the Power-Ups menu
    // what should Trello show. We highly recommend the popup in this case as
    // it is the least disruptive, and fits in well with the rest of Trello's UX
    return t.popup({
      title: "Custom Fields Settings",
      url: "../html/settings.html",
      height: 184 // we can always resize later
    });
  }
});
