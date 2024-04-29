function addListItem(id, textContent) {
  // Get the ul element by id
  var ul = document.getElementById(id);
  // Create a new li element
  var li = document.createElement("li");
  // Set the text content of the li element
  li.textContent = textContent;
  // Append the li element to the ul element
  ul.appendChild(li);
}

function updateTextContent(id, textContent) {
  var element = document.getElementById(id);
  var textWithNewLines = textContent.replace(/\n/g, "<br>");

  // Set the text content of the h5 element
  element.innerHTML = textWithNewLines;
}

function insertNote(textContent) {
  // Get the element before which you want to insert the new <article> section
  var referenceElement = document.getElementById('id-article-features');
  // Define the HTML content for the new <article> section
  var newArticleHTML = `
<article>
  <header>
    <h4 class="cls-highlight">Note</h4>
  </header>
  <h5 id="txt-note"></h5>
</article>
`;
  // Insert the new <article> section before the reference element
  referenceElement.insertAdjacentHTML('beforebegin', newArticleHTML);
  updateTextContent('txt-note', textContent);
}

