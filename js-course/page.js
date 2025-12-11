"use strict";

assert(Assignment, "`page.js` requires `assignment.js`");

/**
 * Settings for the HTML page.
 * @namespace
 */
var Page = Page || {
  TITLE: null,
};

$(() => {
  const MDASH = " &mdash; ";

  const assignmentNum = `COS426 Final Project`;
  let title;
  if (Page.TITLE == null) {
    title = Assignment.ASSIGNMENT_NAME;
  } else {
    title = [Assignment.ASSIGNMENT_NAME, Page.TITLE].join(MDASH);
  }

  // if a <title> element already exists, it will take precedence because this
  // is being added after
  $(document.head).append(
    $("<title>").html([assignmentNum, title].join(MDASH))
  );

  // set the title text on the page
  $("#title").html(
    [`<div class="assignment">${assignmentNum}</div>`, title].join("")
  );
});
