// initializing various services
const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const Resource = mongoose.model('resource');
const formidable = require('formidable');
const http = require('http');
const fs = require('fs/promises');
const path = require('path');
const { formattedOrderClause } = require('mongodb/lib/utils');

// state abbreviations to state names
const states = {'AL':'Alabama',
	'AK':'Alaska',
	'AZ':'Arizona',
	'AR':'Arkansas',
	'CA':'California',
	'CO':'Colorado',
	'CT':'Connecticut',
	'DE':'Delaware',
	'DC':'District Of Columbia',
	'FL':'Florida',
	'GA':'Georgia',
	'HI':'Hawaii',
	'ID':'Idaho',
	'IL':'Illinois',
	'IN':'Indiana',
	'IA':'Iowa',
	'KS':'Kansas',
	'KY':'Kentucky',
	'LA':'Louisiana',
	'ME':'Maine',
	'MD':'Maryland',
	'MA':'Massachusetts',
	'MI':'Michigan',
	'MN':'Minnesota',
	'MS':'Mississippi',
	'MO':'Missouri',
	'MT':'Montana',
	'NE':'Nebraska',
	'NV':'Nevada',
	'NH':'New Hampshire',
	'NJ':'New Jersey',
	'NM':'New Mexico',
	'NY':'New York',
	'NC':'North Carolina',
	'ND':'North Dakota',
	'OH':'Ohio',
	'OK':'Oklahoma',
	'OR':'Oregon',
	'PA':'Pennsylvania',
	'RI':'Rhode Island',
	'SC':'South Carolina',
	'SD':'South Dakota',
	'TN':'Tennessee',
	'TX':'Texas',
	'UT':'Utah',
	'VT':'Vermont',
	'VA':'Virginia ',
	'WA':'Washington',
	'WV':'West Virginia',
	'WI':'Wisconsin',
	'WY':'Wyoming'};

// processing resource types array (removing spaces and forcing lowercase)
const processedResourceTypes = [];
// we dont do this in the array to begin with for readability on the dropdown box
process.resourceTypes.forEach(value => {
  processedResourceTypes.push(processResourceType(value));
});

function processResourceType(type) {
  // removing all spaces from the requested type & making it non case sensitive
  return type.replace(/ /g, '').toLowerCase(); 
}

// GET request for Uploads
router.get('/uploads/:id', (req, res) => {
  Resource.findById(req.params.id, (err, doc) => {
    if (!err) {
      res.render("resource/uploads", {
        viewTitle: "Uploads",
        resource: JSON.parse(JSON.stringify(doc)),
      });
    }
  });
});
// POST request for Uploads (multipart form needs formidable)
// attachments are saved in the path given by the commandline arg (deafult is "%appdata%/resourceDatabase/assets/attachments")
// each resource creates a folder in that directory with its id as the name
router.post('/uploads', async (req, res) => {
  var id;
  
  const form = formidable.IncomingForm({
    keepExtensions: true,
    uploadDir: "attachments/"
  });

  form.parse(req, async (err, fields, files) => {
    //Name of file if exists
    const fName = String(files.fileUpload.name);

    // Is valid file there?
    if (fName.length > 0) {
      if (err) {
        console.log("error during attachment form parsing: " + err);
        res.redirect('/uploads/' + id);
      }
      const uploadDirectory = process.uploadDir + "/" + fields._id;
      id = fields._id;
  
      try {
        await fs.stat(uploadDirectory)
      } 
      catch (e) {
        if (e.code === "ENOENT") 
          await fs.mkdir(uploadDirectory);
        else 
          throw e
      }
  
      const filePath = uploadDirectory + "/" + files.fileUpload.name;
      const tmpFile = files.fileUpload.path;
      await fs.rename(tmpFile, filePath);
      const fs1 = require('fs');

      // add the new uploaded filename to the record
      Resource.findById(id, (err, resource) => {
        if (err) {
          console.log("error during attachment resource finding (id: " + id + "): " + err);
        }
        else if (resource === null) {
          console.log("resource not found");
        } 
        else {
          // mongoose maps cannot have '.' in a key
          resource.resourceFiles.set(files.fileUpload.name.replaceAll(".", ":"), filePath);
          resource.save((err, doc) => {
            if (err)
              console.log('Error during attachment insertion: ' + err);
            
            res.redirect('/resource/uploads/' + id);
          });
        }
      });
    }
    // If no resource selected, redirect
    else {
      res.redirect('back');
    }
  });
});

// GET request for downloading an attachment
router.get('/attachments/:id/:filename', (req, res) => {
  Resource.findById(req.params.id, (err, doc) => {
    if (err) {
      console.log(err);
      return;
    }
    res.download(doc.resourceFiles.get(req.params.filename.replaceAll(".",":")), (err) => {
      if (err) {
        console.log(err);
      }
    });
  });
});

// GET request for Insert Resource
router.get('/', (req, res) => {
  res.render("resource/addOrEdit", {
    states: states,
    viewTitle: "Insert Resource",
    resource: req.body,
    types: process.resourceTypes
  });
});

// POST request for Insert Resource
router.post('/', (req, res) => {
  if (req.body._id === '')
    insertRecord(req, res);
  else
    updateRecord(req, res);
});

// method to insert record into the database
function insertRecord(req, res) {
  const state = states[req.body.resourceState];
  const resource = new Resource({
      resourceTypeDisplay: req.body.resourceType,
      resourceName: req.body.resourceName,
      resourcePhone: req.body.resourcePhone,
      resourceAddress: req.body.resourceAddress,
      resourceCity: req.body.resourceCity,
      resourceState: state,
      resourceZip: req.body.resourceZip,
      resourceHours: req.body.resourceHours,
      resourceWebsite: req.body.resourceWebsite,
      resourceServices: req.body.resourceServices,
      resourceLink: req.body.resourceLink,
      resourceReferrals: 0,
      resourceSuccessPercent: "0%",
      resourceReferralFails: {},
      resourceFiles: {},
      resourceSearchData: req.body.resourceAddress + " " + req.body.resourceWebsite + " " + req.body.resourceName + " " + req.body.resourceType + " " + req.body.resourceZip + " " + req.body.resourceCity,
    }
  );

  resource.save((err, doc) => {
    if (!err)
      res.redirect('resource/list');
    else {
      if (err.name === 'ValidationError') {
        handleValidationError(err, req.body);
        res.render("resource/addOrEdit", {
          states: states,
          resource: req.body,
          types: process.resourceTypes
        });
      }
      else
        console.log('Error during record insertion : ' + err);
    }
  });
}

// method to update a record in the database
function updateRecord(req, res) {
  req.body.resourceSearchData = req.body.resourceAddress + " " + req.body.resourceWebsite + " " + req.body.resourceName + " " + req.body.resourceType + " " + req.body.resourceZip + " " + req.body.resourceCity;

  //updating all normal fields
  req.body.resourceTypeDisplay = req.body.resourceType;
  req.body.resourceType = processResourceType(req.body.resourceType);
  req.body.resourceState = states[req.body.resourceState].trim();
  
  
  Resource.findOneAndUpdate({ _id: req.body._id }, req.body, { new: true }, (err, doc) => {
    if (!err) {
      //updating referrals
      //if for some reason the referrals gets corrupted, we will set it back to 0.
      if (isNaN(doc.resourceReferrals)) {
        doc.resourceReferrals = 0;
      }
      if (req.body.resourceReferral != "") {
        //update referrals based on the input
        doc.resourceReferrals += 1;
        if (req.body.resourceReferral != "Successful") {
          if (doc.resourceReferralFails.has(req.body.resourceReferral)) {
            doc.resourceReferralFails.set(req.body.resourceReferral, doc.resourceReferralFails.get(req.body.resourceReferral) + 1);
          }
          else {
            doc.resourceReferralFails.set(req.body.resourceReferral, 1); //first instance of this reason.
          }
        }
        var totalFails = 0;
        for (var fail of doc.resourceReferralFails.values()) {
          totalFails += fail;
        }
        doc.resourceSuccessPercent = (100 - 100 * totalFails / doc.resourceReferrals).toFixed(0) + "%";
      }
      doc.save();
      res.redirect('resource/list');
    }
    else {
      if (err.name === 'ValidationError') {
        handleValidationError(err, req.body);
        res.render("resource/addOrEdit", {
          viewTitle: 'Update Resource',
          states: states,
          resource: req.body,
          types: process.resourceTypes
        });
      }
      else
        console.log('Error during record update : ' + err);
    }
  });
}

// GET request for the full list of resources
router.get('/list', (req, res) => {
  Resource.find((err, docs) => {
    if (!err) {
      res.render("resource/list", {
        list: JSON.parse(JSON.stringify(docs))
      });
    }
    else {
      console.log('Error in retrieving resource list :' + err);
    }
  });
});

// GET request for filtering by a resource type
router.get('/list/:type', (req, res) => {
  const type = processResourceType(req.params.type)
  if (!processedResourceTypes.includes(type)) {
    console.log("invalid resource type: " + type);
    return;
  }
  Resource.find({ resourceType: type }, (err, result) => {
    if (err) {
      console.log(err);
      return;
    }
    else {
      res.render("resource/list", {
        list: JSON.parse(JSON.stringify(result))
      });
    }
  })
});

// POST request for searching the mongo database
router.post('/list/search', (req, res) => {
  Resource.find({ resourceSearchData: new RegExp(req.body.resourceSearchData, 'i') }, function (err, docs) { //search is a string that the funcition is searching for, edit as needed
    if (err) {
      console.log(err);
      return
    }
    else {
      res.render("resource/list", {
        list: JSON.parse(JSON.stringify(docs))
      });
    }
  })
});

// GET request to update the selected resource
router.get('/:id', (req, res) => {
  Resource.findById(req.params.id, (err, doc) => {
    if (!err) {
      res.render("resource/addOrEdit", {
        viewTitle: "Update Resource",
        states: states,
        resource: JSON.parse(JSON.stringify(doc)),
        types: process.resourceTypes
      });
    }
  });
});

// GET request to delete the selected resource attachment
router.get('/delete/attachments/:id/:attachment', async (req, res) => {
  const key = req.params.attachment.replaceAll(".",":");

  const file = process.uploadDir + "/" + req.params.id + "/" + req.params.attachment;
  
  const model = await Resource.findOne({_id:req.params.id});

  model.resourceFiles.delete(key);
  await model.save();

  console.log("Also deleting the attachment file: "+file);
  try {
    await fs.rm(file, {}, (err) => {
      if (err) {
        throw err;
      }
    });
  }
  catch (error) {
    console.log("Error in removing resource attachment (" + file + "): " + error);
  }
  res.redirect('/resource/uploads/'+req.params.id);

});

// GET request to delete the selected resource
router.get('/delete/:id', (req, res) => {
  Resource.findByIdAndRemove(req.params.id, async (err, doc) => {
    if (!err) {
      //delete attachments folder for it too
      const folder = process.uploadDir + "/" + req.params.id;
      try {
        await fs.rmdir(folder, {recursive: true}, (err) => {
          if (err) {
            throw err;
          }
        });
      } 
      catch (error) {
        console.log("Error in removing resource directory (" + folder + "): " + error);
      }
      res.redirect('/resource/list');
    } 
    else { 
      console.log('Error in resource delete :' + err); 
    }
  });
});

module.exports = router;