import express from 'express';
import os from 'os';
import multer from 'multer';
import cors from 'cors';
import { spawn } from 'child_process';
import path from 'path';
import { promises as fs } from 'fs'; // Use promises from fs
import { fileURLToPath } from 'url';
import { createClient } from '@supabase/supabase-js'
import { v4 as uuidv4 } from 'uuid';
import bodyParser from 'body-parser';


import dotenv from 'dotenv'
dotenv.config()

const supabaseUrl = 'https://soybdylwmocazyfohbwq.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNveWJkeWx3bW9jYXp5Zm9oYndxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MTg3MTM0NTIsImV4cCI6MjAzNDI4OTQ1Mn0.aP_KG6t8pBh6k_rYVwNw-7t9eUQVYiGN6FGCSZVnECU';
const supabase = createClient(supabaseUrl, supabaseKey);

// probably dont need this since we are not longer running a dev server
const corsOptions = {
  origin: 'http://localhost:5173',
  methods: ['GET', 'POST'], 
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true 
};

const app = express();
app.use(cors(corsOptions));
const jsonParser = bodyParser.json();
app.use(jsonParser);
//app.use(express.json());

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
app.use(express.static(path.join(__dirname, 'public')));
const publicDir = path.join(__dirname, 'public');
const PORT = 3000;

const jobs = supabase.channel('custom-all-channel')
  .on(
    'postgres_changes',
    { event: '*', schema: 'public', table: 'jobs' },
    (payload) => {
      //console.log('Change received!', payload)
    }
  )
  .subscribe()

async function fetchAllJobs() {
  try {
    const { data, error } = await supabase
      .from('jobs')
      .select('*');
    if (error) {
      throw new Error(error.message);
    }
    if (data && data.length > 0) {
      console.log('Jobs retrieved successfully:', data);
    } else {
      console.log('No jobs found.');
    }
  } catch (error) {
    console.error('Error fetching jobs:', error.message);
  }
}

async function insertJob(jobName) {
  try {
      if (!jobName) {
        throw new Error('Job name cannot be empty');
      }

      const { data, error } = await supabase
        .from('jobs')
        .insert([
          { name: jobName },
        ])
        .select()

      if (error) {
        throw new Error(error.message);
      } else {
        return data;
      }
    console.log('Job inserted successfully:', data);
  } catch (error) {
    console.error('Error inserting job:', error.message);
  }
}

app.get('/getPolylines/:id', async (req, res) => {
  const id = req.params.id;
  let { data, error } = await supabase
    .from('jobs')
    .select('paths')
    .eq('id', id)

  if (error) {
    console.log(error.message)
  } 

  console.log(data)
  res.json(data);
})

app.get('/upload/:id', async (req, res) => {
  const jobId = req.params.id;
  res.sendFile(path.join(__dirname, 'public', 'upload.html'));
})

app.get('/map/:id', async (req, res) => {
  const jobId = req.params.id;
  let { data, error } = await supabase
  .from('jobs')
  .select('lidar_uploaded')
  .eq('id', jobId)
  .single()

  if (error) {
    console.log(error.message)
  } 
  if (!data.lidar_uploaded) {
    console.log('redir back to upload')
    res.redirect(`/upload/${jobId}`);
  } else {
    console.log('redir to map, sending file')
    res.sendFile(path.join(__dirname, 'public', 'map.html'));
  }
})

app.get('/getMetadata/:id', async (req, res) => {
  const id = req.params.id
  const url = await fetchMetaDataPublicUrl(id); 
  res.json({ url });
})

async function fetchMetaDataPublicUrl(id) {
  try {
    const { data, error } = await supabase.storage
      .from('lidar')
      .getPublicUrl(`${id}/metadata.json`);
    
    if (error) {
      throw error;
    }
    
    return data.publicUrl;
  } catch (error) {
    console.error('Error fetching file URL:', error.message);
    throw error;
  }
}

app.get('/lowestMidspans/:id', async (req, res) => {
  const id = req.params.id
  try {
    let { data, error } = await supabase
    .from('jobs')
    .select('markers')
    .eq('id', id)

    if (error) {
      throw new Error("Failed to fetch markers from database");
    }
    
    const midspans = getLowestMidspans(id, data)

  } catch (error) {
    console.error(error.message);
  }
})

async function getLowestMidspans(key, poleLocations) {
  return new Promise((resolve, reject) => {
    // SECOND PROCESS REQUIRED: EXTRACT ALL POLE LOCATIONS TO GET READY TO SELECT ALL REAL POLES
    console.log('spawning process')
    console.log(poleLocations)
    const pythonProcess = spawn('python3', [`${__dirname}/extract_lowest_midspans.py`, `${__dirname}/input.las`, `${poleLocations}`]);

    let jsonString = '';
    pythonProcess.stdout.on('data', (data) => {
      jsonString += data.toString();
    });

    pythonProcess.stderr.on('data', (data) => {
      console.error(`Python stderr: ${data}`);
    });

    pythonProcess.on('close', async (code) => {
      if (code === 0) {
        console.log(jsonString)
        console.log('do something here')
      } else {
        console.error('Python script exited with error code:', code);
        reject(false);
      }
    });
  });
}

app.get('/jobs', async (req, res) => {
  console.log("trying to get jobs")
  let { data, error } = await supabase
    .from('jobs')
    .select('*')
  
  if (error) {
    res.status(500).send(error.message);
  } else {
    res.send(data)
  }
})

app.post('/createJob', async (req, res) => {
  try {
    const { jobName } = req.body;
    const data = await insertJob(jobName);
    res.status(201).json(data[0]);
  } catch (error) {
    console.error('Error creating job:', error.message);
    res.status(500).send('Failed to create job');
  }
});


//TODO STORE LAS FILE SOMEWHERE
// LAS FILE UPLOADING

const uploadDir = path.join(__dirname, 'uploads');
if (!fs.access(uploadDir)) {
  fs.mkdirSync(uploadDir);
}

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, path.join(__dirname, 'uploads'));
  },
  filename: function (req, file, cb) {
    cb(null, file.originalname);
  }
});

const upload = multer({ storage });
app.post('/convertToOctree/:key', upload.single('file'), async (req, res) => {
  const key = req.params.key

  const uploadedFile = req.file;
  const uploadedFilePath = uploadedFile.path;
  const fileContent = await fs.readFile(uploadedFilePath);
  // Upload the file to Supabase Storage
  try {
    const { data, error } = await supabase
      .storage
      .from('lidar')
      .upload(`${key}/${key}.las`, fileContent)

    if (error) {
      throw new Error("Error uploading las file to database");
    }
      //need to handle this- display to user
  } catch (error) {
    console.log(error.message);
  }


  try {
    if (!uploadedFile) {
      return res.status(400).send('No file uploaded.');
    }

    // FIRST PROCESS REQUIRED: CONVERT LAS INTO OCTREE AND SAVE TO DATABASE
    const potreeConverterPath = '/home/ja/pivottmp/public/PotreeConverter';
    const potreeProcess = spawn(potreeConverterPath, [uploadedFile.path, '-o', `${uploadDir}/${key}`]);

    potreeProcess.stdout.on('data', (data) => {
      console.log(`PotreeConverter stdout: ${data}`);
    });

    potreeProcess.stderr.on('data', (data) => {
      console.error(`PotreeConverter stderr: ${data}`);
    });

    potreeProcess.on('close', async (code) => {
      console.log(`PotreeConverter process exited with code ${code}`);
      if (code === 0) {
        const dir = `${uploadDir}/${key}`;
        const files = await fs.readdir(dir);

        try {
          await uploadFiles(path.join(dir), key, files);

          const { data: jobData, error: jobError } = await supabase
            .from('jobs')
            .update({ lidar_uploaded: true })
            .eq('id', key)
            .single();

          if (jobError) {
            console.log("Error updating jobs table", jobError);
            return res.status(500).send('Error updating jobs table.');
          } else {
            res.redirect(`/map/${key}`);
          }
        } catch (uploadFilesError) {
          console.error('Error uploading files:', uploadFilesError);
          res.status(500).send('Error uploading files.');
        }
      } else {
        console.error('PotreeConverter exited with error code:', code);
        res.status(500).send(`
          <html>
            <body>
              <script>
                alert('Error processing files.');
                window.location.href = '/map/${key}';
              </script>
            </body>
          </html>
        `);
      }
    });
  } catch (error) {
    console.error('Error:', error);
  }
});


async function getPoleLocations(key) {
  // TODO THIS NEEDS TO BE THE NAME OF THE KEY
  console.log("getting pole locations")
  const { data, error } = await supabase
    .storage
    .from('lidar')
    .download(`${key}/${key}.las`)
      
  const arrayBuffer = await data.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  if (error) {
    console.error('Error downloading file:', error)
    return null
  } else {
    console.log('file downloaded')
  }
  return new Promise((resolve, reject) => {
    const pythonProcess = spawn('python3', [`${__dirname}/extract_pole_locations.py`]);

    console.log(buffer)
    pythonProcess.stdin.write(buffer);
    pythonProcess.stdin.end();
    //const pythonProcess = spawn('python3', [`${__dirname}/extract_pole_locations.py`, data]);

    let jsonString = '';
    pythonProcess.stdout.on('data', (data) => {
      jsonString += data.toString();
    });

    pythonProcess.stderr.on('data', (data) => {
      console.error(`Python stderr: ${data}`);
    });

    pythonProcess.on('close', async (code) => {
      if (code === 0) {
        try {
          const poleData = JSON.parse(jsonString);
          let { data, error } = await supabase
            .from('jobs')
            .update({ poles: poleData })
            .eq('id', key)
            .single();

          if (error) {
            console.log("Error updating jobs table", error);
            reject(false);
          } else {
            console.log("Successfully extracted poles");
            resolve(poleData);
          }
        } catch (error) {
          console.error('Error parsing JSON or updating database:', error);
          reject(false);
        }
      } else {
        console.error('Python script exited with error code:', code);
        reject(false);
      }
    });
  });
}
//async function getPoleLocations(key) {
//    // SECOND PROCESS REQUIRED: EXTRACT ALL POLE LOCATIONS TO GET READY TO SELECT ALL REAL POLES
//  const pythonProcess = spawn('python3', [`${__dirname}/extract_pole_locations.py`, `${__dirname}/input.las`]);
//
//  let jsonString = '';
//  pythonProcess.stdout.on('data', (data) => {
//    jsonString += data.toString();
//  });
//
//  pythonProcess.stderr.on('data', (data) => {
//    console.error(`Python stderr: ${data}`);
//  });
//  
//  let poleLocationsLoaded = false;
//  pythonProcess.on('close', async (code) => {
//    if (code === 0) {
//      const poleData = JSON.parse(jsonString);
//      let { data, error } = await supabase
//        .from('jobs')
//        .update({ pole_locations: poleData})
//        .eq('id', key)
//        .single();
//
//      if (error) {
//        console.log("Error updating jobs table", error);
//      } else {
//        poleLocationsLoaded = true;
//        console.log("Successfully extracted poles");
//        console.log(poleLocationsLoaded)
//      }
//    } else {
//      console.error('Python script exited with error code:', code);
//    }
//  });
//  return poleLocationsLoaded;
//}

async function chunkFile(filePath, maxSize) {
  const chunks = [];
  const fileSize = fs.statSync(filePath).size;
  const bufferSize = Math.min(fileSize, maxSize);

  let offset = 0;

  while (offset < fileSize) {
    const chunkSize = Math.min(bufferSize, fileSize - offset);
    const chunkBuffer = Buffer.alloc(chunkSize);
    const fileDescriptor = fs.openSync(filePath, 'r');

    fs.readSync(fileDescriptor, chunkBuffer, 0, chunkSize, offset);
    fs.closeSync(fileDescriptor);

    chunks.push(chunkBuffer);
    offset += chunkSize;
  }

  return chunks;
}

async function uploadFileOrChunks(dir, fileName, key, maxSize) {
  const filePath = path.join(dir, fileName);
  const fileSize = fs.statSync(filePath).size;

  if (fileSize > maxSize) {
    // Chunk the file
    const chunks = await chunkFile(filePath, maxSize);
    for (let i = 0; i < chunks.length; i++) {
      const { data, error } = await supabase.storage
        .from('lidar')
        .upload(`${key}/bin/r${i}.bin`, chunks[i])

      if (error) {
        console.error(`Error uploading chunk ${i} of ${fileName} to database`, error);
        return;
      }
    }
  } else {
    //TODO Upload the entire file. I dont think we need this condition? 
    const fileData = await readFileAsync(filePath);
    const { data, error } = await supabase.storage
      .from('lidar')
      .upload(`/${key}`, fileData)
    if (error) {
      console.error(`Error uploading ${fileName} to database`, error);
    }
  }
}

async function uploadFiles(dir, key, files) {
  for (const file of files) {
    const filePath = path.join(dir, file);
    const fileContent = await fs.readFile(filePath);

    const { data, error } = await supabase
      .storage
      .from('lidar')
      .upload(`${key}/${file}`, fileContent);

    if (error) {
      throw new Error(`Error uploading file ${file} to database: ${error.message}`);
    }
  }
}

app.get('/getIfJobHasBeenSaved/:id', async (req, res) => {
  const id = req.params.id;
  try {
    let { data, error } = await supabase
      .from('jobs')
      .select('saved')
      .eq('id', id)
      .single();

    if (error) {
      throw new Error(error.message);
    }

    if (data && data.saved) {
      return res.json(true);
    } else {
      return res.json(false);
    }
  } catch (error) {
    console.error("Error fetching jobSaved from database", error);
    return res.status(500).json(false);
  }
})

async function retrieveMarkersAndPathsFromDb(id) {
  try {
    let { data, error } = await supabase
    .from('jobs')
    .select('markers,paths')
    .eq('id', id);
    
    if (error) {
      throw new Error(error.message);
    }

    return res.status(200).json(data);

  } catch (error) {
    console.log("Error fetching markers and paths from database", error);
  }
}

app.get('/getMarkersAndPaths/:id', async (req, res) => {
  const id = req.params.id;
  console.log('fetching markers')
  try {
    let { data, error } = await supabase
      .from('jobs')
      .select('poles')
      .eq('id', id)
      .single();

    if (error) {
      throw new Error(error.message);
    } 

    if (data.poles) {
      res.json(data.poles)
    } else {
      console.log("collecting pole locations")
      const poles = await getPoleLocations(id);
      res.json(poles)
    }
  } catch (error) {
    console.log(error);
  }
})

app.get('/lowest_midspans', async (req, res) => {
  try {
    // Construct the path to the JSON file
    const filePath = path.join(__dirname, 'lowest_midspans.json');

    const data = await fs.readFile(filePath);

    const jsonData = JSON.parse(data);
    res.json(jsonData);

  } catch (error) {
    console.error('Error reading file:', error);
    res.status(500).send('Error reading file');
  }
})

app.post('/wires', (req, res) => {
  const { paths } = req.body;

    // Spawn a new process to call the Python script
    const pythonProcess = spawn('python3', ['find_wire_locations.py']);

    // Send the paths to the Python script via stdin
    pythonProcess.stdin.write(JSON.stringify(paths));
    pythonProcess.stdin.end();

    let output = '';

    // Collect data from the Python script's stdout
    pythonProcess.stdout.on('data', (data) => {
        output += data.toString();
    });

    // Handle script completion
    pythonProcess.on('close', (code) => {
        if (code !== 0) {
            return res.status(500).json({ error: 'Failed to process paths with Python script' });
        }
        try {
            const wireLocations = JSON.parse(output);
            res.json(wireLocations);
        } catch (error) {
            res.status(500).json({ error: 'Error parsing wire locations from Python script' });
        }
    });

    // Handle script errors
    pythonProcess.on('error', (error) => {
        res.status(500).json({ error: 'Error executing Python script' });
    });

});

app.get('/getPoleLines', async(req, res) => {
  const filePath = path.join(__dirname, 'output_segments.json');
  const data = await fs.readFile(filePath);

  const jsonData = JSON.parse(data);
  res.json(jsonData);
})

app.listen(PORT, () => {
  console.log(`Server is running on port 'http://localhost:${PORT}`);
});


app.get('/paths:id', async (req, res) => {
  const id = req.params.id;
  const filePath = path.join(__dirname, `paths.json`);

  // Send the file as a response
  res.sendFile(filePath);
})


app.get('/vegetationEncroachments/:id', async (req, res) => {
  const id = req.params.id;
  try {
    const { data, error } = await supabase
      .from('jobs')
      .select('vegetation')
      .eq('id', id);

    if (error) {
      throw new Error('Failed to fetch vegetation encroachments');
    }

    if (data && data.vegetation) {
      res.json(data);
    } else {
      const { data: fileData, error: fileError } = await supabase
        .storage
        .from('lidar')
        .download(`${id}/${id}.las`);

      if (fileError) {
        console.error('Error downloading file:', fileError);
        return res.status(500).send('Error downloading file');
      }

      const arrayBuffer = await fileData.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);

      const { data: midspanData, error: midspanError } = await supabase
        .from('jobs')
        .select('midspans')
        .eq('id', id)
        .single()

      const pythonProcess = spawn('python3', [`${__dirname}/extract_vegetation.py`]);

      pythonProcess.stdin.write(buffer);
      pythonProcess.stdin.write(JSON.stringify(midspanData));
      pythonProcess.stdin.end();

      //if (midspanError || !midspanData) {
      //  pythonProcess.stdin.write(JSON.stringify([]));
      //} else {
      //  pythonProcess.stdin.write(JSON.stringify(midspanData));
      //}
      //pythonProcess.stdin.end();

      let result;
      pythonProcess.stdout.on('data', (data) => {
        result = data.toString().trim();
        console.log('Result:', result);
      });

      pythonProcess.stderr.on('data', (data) => {
        console.error(`Python stderr: ${data}`);
      });

      pythonProcess.on('close', async (code) => {
        if (code === 0) {
          try {
            const vegetationEncroachments = JSON.parse(result);
            const { data: updateData, error: updateError } = await supabase
              .from('jobs')
              .update({ vegetation: vegetationEncroachments })
              .eq('id', id)
              .single();

            if (updateError) {
              console.log("Error updating jobs table", updateError);
              res.status(500).send("Error updating database");
            } else {
              console.log("Successfully extracted vegetation data");
              res.json(vegetationEncroachments)
            }
          } catch (error) {
            console.error('Error parsing JSON or updating database:', error);
            res.status(500).send('Error processing vegetation data');
          }
        } else {
          console.error('Python script exited with error code:', code);
          res.status(500).send('Error running Python script');
        }
      });
    }
  } catch (error) {
    console.error('Error fetching vegetation encroachments:', error.message);
    res.status(500).send('Internal Server Error');
  }
});
//app.get('/vegetationEncroachments/:id', async (req, res) => {
//  const id = req.params.id;
//  try {
//    const { data, error } = await supabase
//      .from('jobs')
//      .select('vegetation')
//      .eq('id', id)
//
//    if (error) {
//      throw new Error('Failed to fetch vegetation encroachments');
//    }
//
//    if (data.vegetation) {
//      res.json(data)
//    } else {
//      const { data, error } = await supabase
//      .storage
//      .from('lidar')
//      .download(`${id}/${id}.las`)
//
//      //if (error) {
//      //  console.error('Error downloading file:', error)
//      //  return res.status(500).send('Error downloading file');
//      //} else {
//      //  console.log('file downloaded')
//      //}
//
//      const arrayBuffer = await data.arrayBuffer();
//      const buffer = Buffer.from(arrayBuffer);
//      
//      return new Promise((resolve, reject) => {
//        console.log('here')
//        const pythonProcess = spawn('python3', [`${__dirname}/extract_vegetation.py`]);
//
//        pythonProcess.stdin.write(buffer);
//        pythonProcess.stdin.end();
//
//        let jsonString = '';
//        pythonProcess.stdout.on('data', (data) => {
//          jsonString += data.toString();
//        });
//
//        pythonProcess.stderr.on('data', (data) => {
//          console.error(`Python stderr: ${data}`);
//        });
//
//        pythonProcess.on('close', async (code) => {
//          if (code === 0) {
//            try {
//              const poleData = JSON.parse(jsonString);
//              let { data, error } = await supabase
//                .from('jobs')
//                .update({ poles: poleData })
//                .eq('id', key)
//                .single();
//
//              if (error) {
//                console.log("Error updating jobs table", error);
//                reject(false);
//              } else {
//                console.log("Successfully extracted poles");
//                resolve(poleData);
//              }
//            } catch (error) {
//              console.error('Error parsing JSON or updating database:', error);
//              reject(false);
//            }
//          } else {
//            console.error('Python script exited with error code:', code);
//            reject(false);
//          }
//        });
//      });
//    }
//  } catch (error) {
//    console.error('Error fetching vegetation encroachments:', error.message);
//    return [];
//  }  
//})

app.post('/savePaths/:id', async (req, res) => {
  const id = req.params.id;
  try {
    const { data, error } = await supabase
      .from('jobs')
      .update({ midspans: req.body })
      .eq('id', id)
      .select()

    if (error) {
      throw new Error("Failed to fetch markers from database");
    }

    const updatedRecord = await supabase
      .from('jobs')
      .select('midspans')
      .eq('id', id)
      .single();

    res.status(200).json(updatedRecord);

  } catch (error) {
    console.error(error.message);
  }
})

app.get('/midspans/:id', async (req, res) => {
  const id = req.params.id;
  try {
    const { data, error } = await supabase
      .from('jobs')
      .select('midspans')
      .eq('id', id)
      .single()

    const midspans = data && data.midspans ? data.midspans : [];
    return res.json(midspans)

    if (error) {
      throw new Error("Failed to fetch markers from database");
    }
  } catch (error) {
    console.error(error.message);
  }
})
