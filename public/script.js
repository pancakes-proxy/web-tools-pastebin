document.getElementById("pasteForm").addEventListener("submit", function(e) {
  e.preventDefault();
  const content = document.getElementById("content").value.trim();
  if (!content) {
    alert("Content cannot be empty.");
    return;
  }
  
  fetch("/api/paste", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ content })
  })
  .then(response => response.json())
  .then(data => {
    if (data.error) {
      document.getElementById("result").innerHTML = `<p style="color:red;">Error: ${data.error}</p>`;
    } else {
      document.getElementById("result").innerHTML = `
        <p>Paste created! <a href="${data.url}" target="_blank">${data.url}</a></p>
      `;
      // Clear the textarea after successful paste creation
      document.getElementById("content").value = "";
    }
  })
  .catch(err => {
    console.error("Error:", err);
    document.getElementById("result").innerHTML = `<p style="color:red;">Unexpected error. Please try again.</p>`;
  });
});