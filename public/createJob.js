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

$(document).ready(function() {
  // fetch jobs from the server
  fetch('/jobs')
    .then(response => response.json())
    .then(data => {
      jobList = data;
    })

  function populateDropdown(items) {
    const dropDownMenu = $('#dropdown-menu');
    dropDownMenu.empty();
    items.forEach(item => {
      console.log(item)
      dropDownMenu.append(`<a id="anchor"href="/map/${item.id}"><li>${item.name}</li></a>`);
    });
  }

  $('#joblist-dropdown').on('click', function(event) {
    event.stopPropagation(); // Prevent event from bubbling up
    populateDropdown(jobList);
    $('#dropdown-menu').toggleClass('hidden');
  });

  $('#job-search-input').on('focus', function() {
    populateDropdown(jobList);
    $('#dropdown-menu').toggleClass('hidden');
  });

  $(document).on('click', function(event) {
    const target = $(event.target);
    const isDropdownClick = target.closest('#dropdown-menu').length > 0;
    const isLeftContainerClick = target.closest('#left-container').length > 0;

    if (!isDropdownClick && !isLeftContainerClick) {
      $('#dropdown-menu').addClass('hidden');
    }
  });

  $('#job-search-input').on('blur', function() {
    setTimeout(() => $('#dropdown-menu').addClass('hidden'), 100);
  });

  $('#dropdown-menu').on('click', 'li', function() {
    $('#job-search-input').val($(this).text());
    $('#dropdown-menu').addClass('hidden');
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
