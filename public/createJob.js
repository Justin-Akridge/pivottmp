// CREATE NEW JOB

const createJobForm = document.getElementById("create-job-form");
const jobSearchInput = document.getElementById("job-search-input");
const dropDownList = document.getElementById("joblist-dropdown");
const createJobButton = document.getElementById("create-job-button");
const modal = document.getElementById("jobModal");
const closeModal = modal.querySelector(".close");
const jobListContainer = document.getElementById("dropdown-menu");
const jobNameInput = document.getElementById("job-name")
let jobList = []

createJobForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const formData = new FormData(createJobForm);
  const jobName = formData.get('job-name');
  jobList.unshift({name: jobName})
  jobNameInput.value = ""
  modal.style.display = "none";

  try {
    const response = await fetch("http://localhost:3000/createJob", {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ jobName }),
    });

    if (!response.ok) {
      throw new Error("Failed to create job");
    }

    const job = await response.json();

    window.location.href = `/map/${job.id}`;

    console.log('Job created successfully:', jobName);
  } catch (error) {
    console.error("Error creating job:", error);
  }
})

jobSearchInput.addEventListener('focus', () => {
  jobSearchInput.value = '';
})

createJobButton.addEventListener('click', () => {
  modal.style.display = "block";
});

closeModal.addEventListener('click', () => {
  modal.style.display = "none";
});

window.addEventListener('click', (event) => {
  if (event.target === modal) {
    modal.style.display = "none";
  }
});

// END OF CREATE JOB
//
//
// START OF JOB LIST DROPDOWN MENU

let dropDownMenuOpen = false;
document.addEventListener('DOMContentLoaded', function() {
  // fetch jobs from the server
  fetch('/jobs')
    .then(response => response.json())
    .then(data => {
      jobList = data;
    });

  function populateDropdown(items) {
    const dropDownMenu = document.getElementById('dropdown-menu');
    dropDownMenu.innerHTML = ''; // Clear existing items
    items.forEach(item => {
      const anchor = document.createElement('a');
      anchor.href = `/map/${item.id}`;
      const listItem = document.createElement('li');
      listItem.textContent = item.name;
      anchor.appendChild(listItem);
      dropDownMenu.appendChild(anchor);
    });
  }

  document.getElementById('joblist-dropdown').addEventListener('click', function(event) {
    dropDownMenuOpen = !dropDownMenuOpen;
    event.stopPropagation();
    populateDropdown(jobList);
    document.getElementById('dropdown-menu').classList.toggle('hidden');
  });

  document.getElementById('job-search-input').addEventListener('click', function() {
    event.stopPropagation();
    if (dropDownMenuOpen) {
      return;
    }
    dropDownMenuOpen = !dropDownMenuOpen;
    populateDropdown(jobList);
    document.getElementById('dropdown-menu').classList.toggle('hidden');
  });

  document.addEventListener('click', function(event) {
    if (!dropDownMenuOpen) return;

    dropDownMenuOpen = !dropDownMenuOpen;
    const target = event.target;
    const isDropdownClick = target.closest('#dropdown-menu') !== null;

    if (!isDropdownClick) {
      document.getElementById('dropdown-menu').classList.add('hidden');
    }
  });
});



// UPLOAD FILE
$(document).ready(function() {
  const uploadButton = $('#upload-button');
  const fileInput = $('#file-input');
  const spinnerContainer = $('#spinner-container');

  uploadButton.on('click', function() {
    fileInput.click();
  });

  fileInput.on('change', function() {
    const selectedFile = fileInput[0].files[0];
    if (selectedFile) {
      uploadFile(selectedFile);
    } else {
      console.error("No file selected");
    }
  });

  async function uploadFile(file) {
    const urlParts = window.location.pathname.split('/');
    const key = urlParts[urlParts.length - 1];

    const form = new FormData();
    form.append('file', file);

    // Show spinner container
    spinnerContainer.show();

    try {
      const response = await fetch(`/convertToOctree/${key}`, {
        method: 'POST',
        body: form
      })

      if (!response) {
        throw new Error("Failed to upload file");
      }

      console.log("File uploaded successfully");

      spinnerContainer.hide();
      if (response.redirected) {
        console.log("Redirecting to map page...");
        window.location.href = response.url;
      } else {
        console.log("Unexpected response, not redirecting automatically.");
      }
    } catch (error) {
      console.error("Error uploading file", error.message);

      // Hide spinner container on error
      spinnerContainer.hide();
    }
  }
});
