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
  // Set the text content of the h5 element
  element.textContent = textContent;
}