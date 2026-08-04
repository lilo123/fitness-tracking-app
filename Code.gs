// Code.gs
// This acts as the backend API for your fitness tracker.

function formatDateLocal(dateObj) {
  if (!dateObj) return "";
  if (typeof dateObj === "string") {
    var match = dateObj.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
    if (match) {
      return match[1] + "-" + ("0" + match[2]).slice(-2) + "-" + ("0" + match[3]).slice(-2);
    }
    dateObj = new Date(dateObj);
  }
  if (dateObj instanceof Date && !isNaN(dateObj.getTime())) {
    return Utilities.formatDate(dateObj, SpreadsheetApp.getActiveSpreadsheet().getSpreadsheetTimeZone(), "yyyy-MM-dd");
  }
  return String(dateObj);
}

function resolveSheetName(ss, requestedType, athleteId) {
  var cleanAthlete = (athleteId || "duy").trim().toLowerCase().replace(/[^a-z0-9_]/g, "");
  if (requestedType === "Exercises") {
    return ss.getSheetByName("Exercises") || ss.insertSheet("Exercises");
  }
  
  if (requestedType === "Athletes") {
    var athSheet = ss.getSheetByName("Athletes");
    if (!athSheet) {
      athSheet = ss.insertSheet("Athletes");
      athSheet.getRange(1, 1, 1, 4).setValues([["Athlete_ID", "Display_Name", "Status", "Last_Active"]]);
      athSheet.getRange(2, 1, 1, 4).setValues([["duy", "Duy (Coach)", "Active", new Date().toISOString()]]);
    }
    return athSheet;
  }
  
  if (requestedType === "Logs") {
    var tabName = (cleanAthlete === "duy" || cleanAthlete === "") ? "Logs" : "Logs_" + cleanAthlete;
    var logSheet = ss.getSheetByName(tabName);
    if (!logSheet) {
      logSheet = ss.insertSheet(tabName);
      logSheet.getRange(1, 1, 1, 9).setValues([["Log_ID", "Workout_ID", "Date", "Exercise_ID", "Set_Index", "Weight", "Reps", "Client_ID", "Timestamp"]]);
    }
    return logSheet;
  }
  
  if (requestedType === "Templates") {
    var tplName = (cleanAthlete === "duy" || cleanAthlete === "") ? "Templates" : "Templates_" + cleanAthlete;
    var tplSheet = ss.getSheetByName(tplName);
    if (!tplSheet) {
      tplSheet = ss.insertSheet(tplName);
      tplSheet.getRange(1, 1, 1, 3).setValues([["Template_ID", "Template_Name", "Exercise_Sequence"]]);
      // Copy starter templates if creating new athlete
      var defaultTemplates = [
        ["TPL-1", "Workout A (Push, Quads & Core)", "Incline Bench Press, Cable Lateral Raises, Dips, Leg Extension Machine, Overhead Tricep Cable Pull, Leg Raise"],
        ["TPL-2", "Workout B (Pull, Hamstrings & Core)", "Lat Pull Down, Seated Cable Row, Inclined Bicep Curl, Leg Curl, Face Pulls, Weighted Sit-Up"]
      ];
      tplSheet.getRange(2, 1, defaultTemplates.length, 3).setValues(defaultTemplates);
    }
    return tplSheet;
  }
  
  return ss.getSheetByName(requestedType) || ss.insertSheet(requestedType);
}

function ensureSchema(sheet, sheetType) {
  var lastCol = sheet.getLastColumn();
  if (lastCol === 0) {
    if (sheetType.indexOf("Logs") !== -1) {
      sheet.getRange(1, 1, 1, 9).setValues([["Log_ID", "Workout_ID", "Date", "Exercise_ID", "Set_Index", "Weight", "Reps", "Client_ID", "Timestamp"]]);
      return ["Log_ID", "Workout_ID", "Date", "Exercise_ID", "Set_Index", "Weight", "Reps", "Client_ID", "Timestamp"];
    }
    if (sheetType.indexOf("Templates") !== -1) {
      sheet.getRange(1, 1, 1, 3).setValues([["Template_ID", "Template_Name", "Exercise_Sequence"]]);
      return ["Template_ID", "Template_Name", "Exercise_Sequence"];
    }
    if (sheetType === "Exercises") {
      sheet.getRange(1, 1, 1, 3).setValues([["ID", "Name", "Category"]]);
      return ["ID", "Name", "Category"];
    }
    if (sheetType === "Athletes") {
      sheet.getRange(1, 1, 1, 4).setValues([["Athlete_ID", "Display_Name", "Status", "Last_Active"]]);
      return ["Athlete_ID", "Display_Name", "Status", "Last_Active"];
    }
    throw new Error("Tab '" + sheetType + "' is empty. Add headers to Row 1.");
  }
  var headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
  
  if (sheetType.indexOf("Logs") !== -1) {
    var requiredCols = ["Log_ID", "Workout_ID", "Date", "Exercise_ID", "Set_Index", "Weight", "Reps", "Client_ID", "Timestamp"];
    requiredCols.forEach(function(col) {
      if (headers.indexOf(col) === -1) {
        lastCol++;
        sheet.getRange(1, lastCol).setValue(col);
        headers.push(col);
      }
    });
  }
  if (sheetType.indexOf("Templates") !== -1) {
    var requiredColsTpl = ["Template_ID", "Template_Name", "Exercise_Sequence"];
    requiredColsTpl.forEach(function(col) {
      if (headers.indexOf(col) === -1) {
        lastCol++;
        sheet.getRange(1, lastCol).setValue(col);
        headers.push(col);
      }
    });
  }
  return headers;
}

function seedMasterExercises(ss) {
  var sheet = ss.getSheetByName("Exercises") || ss.insertSheet("Exercises");
  ensureSchema(sheet, "Exercises");
  var data = sheet.getDataRange().getValues();
  var existing = {};
  for (var r = 1; r < data.length; r++) {
    if (data[r][1]) existing[String(data[r][1]).trim().toLowerCase()] = true;
  }
  
  var defaults = [
    ["EX-VT1", "Incline Bench Press", "Chest"],
    ["EX-VT2", "Cable Lateral Raises", "Shoulders"],
    ["EX-VT3", "Dips", "Chest / Triceps"],
    ["EX-VT4", "Leg Extension Machine", "Legs"],
    ["EX-VT5", "Overhead Tricep Cable Pull", "Arms"],
    ["EX-VT6", "Leg Raise", "Core"],
    ["EX-VT7", "Lat Pull Down", "Back"],
    ["EX-VT8", "Seated Cable Row", "Back"],
    ["EX-VT9", "Inclined Bicep Curl", "Arms"],
    ["EX-VT10", "Leg Curl", "Legs"],
    ["EX-VT11", "Face Pulls", "Shoulders"],
    ["EX-VT12", "Weighted Sit-Up", "Core"]
  ];
  
  var toAdd = [];
  defaults.forEach(function(d) {
    if (!existing[d[1].toLowerCase()]) {
      toAdd.push(d);
      existing[d[1].toLowerCase()] = true;
    }
  });
  
  if (toAdd.length > 0) {
    sheet.getRange(sheet.getLastRow() + 1, 1, toAdd.length, 3).setValues(toAdd);
  }
}

function seedMasterTemplates(ss, tabName) {
  var sheet = ss.getSheetByName(tabName) || ss.insertSheet(tabName);
  ensureSchema(sheet, tabName);
  var data = sheet.getDataRange().getValues();
  var existing = {};
  for (var r = 1; r < data.length; r++) {
    if (data[r][1]) existing[String(data[r][1]).trim().toLowerCase()] = true;
  }
  
  var defaults = [
    ["TPL-1", "Workout A (Push, Quads & Core)", "Incline Bench Press, Cable Lateral Raises, Dips, Leg Extension Machine, Overhead Tricep Cable Pull, Leg Raise"],
    ["TPL-2", "Workout B (Pull, Hamstrings & Core)", "Lat Pull Down, Seated Cable Row, Inclined Bicep Curl, Leg Curl, Face Pulls, Weighted Sit-Up"]
  ];
  
  var toAdd = [];
  defaults.forEach(function(d) {
    if (!existing[d[1].toLowerCase()]) {
      toAdd.push(d);
      existing[d[1].toLowerCase()] = true;
    }
  });
  
  if (toAdd.length > 0) {
    sheet.getRange(sheet.getLastRow() + 1, 1, toAdd.length, 3).setValues(toAdd);
  }
}

function doGet(e) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheetType = (e && e.parameter && e.parameter.type) || "Exercises";
  var athlete = (e && e.parameter && e.parameter.athlete) || "duy";
  
  var sheet = resolveSheetName(ss, sheetType, athlete);
  if (!sheet) {
    return createJsonResponse({ error: "Tab not found: " + sheetType });
  }
  
  // If querying Athletes, also scan tabs to discover any newly added athlete tabs
  if (sheetType === "Athletes") {
    var allSheets = ss.getSheets();
    var registered = {};
    var athData = sheet.getDataRange().getValues();
    var athHeaders = athData.shift() || ["Athlete_ID", "Display_Name", "Status", "Last_Active"];
    var idCol = athHeaders.indexOf("Athlete_ID");
    var nameCol = athHeaders.indexOf("Display_Name");
    
    var athleteList = [];
    athData.forEach(function(row) {
      if (row[idCol]) {
        var aId = String(row[idCol]).toLowerCase();
        registered[aId] = true;
        athleteList.push({
          Athlete_ID: aId,
          Display_Name: row[nameCol] || aId,
          Status: row[2] || "Active",
          Last_Active: row[3] || ""
        });
      }
    });
    
    // Auto-discover Logs_* tabs
    var newAthletesToAppend = [];
    allSheets.forEach(function(s) {
      var sName = s.getName();
      if (sName.indexOf("Logs_") === 0) {
        var slug = sName.replace("Logs_", "").toLowerCase();
        if (!registered[slug] && slug !== "duy") {
          registered[slug] = true;
          var displayName = slug.charAt(0).toUpperCase() + slug.slice(1);
          newAthletesToAppend.push([slug, displayName, "Active", new Date().toISOString()]);
          athleteList.push({ Athlete_ID: slug, Display_Name: displayName, Status: "Active", Last_Active: new Date().toISOString() });
        }
      }
    });
    if (newAthletesToAppend.length > 0) {
      sheet.getRange(sheet.getLastRow() + 1, 1, newAthletesToAppend.length, 4).setValues(newAthletesToAppend);
    }
    if (athleteList.length === 0) {
      athleteList.push({ Athlete_ID: "duy", Display_Name: "Duy (Coach)", Status: "Active", Last_Active: new Date().toISOString() });
    }
    return createJsonResponse({ success: true, data: athleteList });
  }
  
  // Automatically write defaults into the physical Google Sheet rows if missing
  if (sheetType === "Exercises") {
    seedMasterExercises(ss);
  } else if (sheetType === "Templates" || sheetType.indexOf("Templates_") === 0) {
    seedMasterTemplates(ss, sheet.getName());
  }
  
  var data = sheet.getDataRange().getValues();
  if (data.length <= 1) {
    return createJsonResponse({ success: true, data: [] });
  }
  
  var headers = data.shift();
  var result = data.map(function(row) {
    var obj = {};
    headers.forEach(function(header, i) {
      obj[header] = (header === 'Date' && row[i]) ? formatDateLocal(row[i]) : row[i];
    });
    return obj;
  });
  
  return createJsonResponse({ success: true, data: result });
}

function doPost(e) {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) {
    return createJsonResponse({ success: false, error: "SERVER_BUSY", retryable: true });
  }
  
  try {
    var body = JSON.parse(e.postData.contents);
    if (!body) throw new Error("Invalid payload: missing body");
    
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var athlete = body.athlete || "duy";
    var sheetType = body.type || (body.action && body.action.indexOf("EXERCISE") !== -1 ? "Exercises" : (body.action && body.action.indexOf("TEMPLATE") !== -1 ? "Templates" : "Logs"));
    var sheet = resolveSheetName(ss, sheetType, athlete);
    
    if (!sheet) {
      return createJsonResponse({ error: "Tab not found for type: " + sheetType });
    }
    
    var headers = ensureSchema(sheet, sheetType);

    // Handle REGISTER_ATHLETE action
    if (body.action === "REGISTER_ATHLETE") {
      var athSheet = resolveSheetName(ss, "Athletes", "duy");
      var newSlug = (body.Athlete_ID || body.Name || "").trim().toLowerCase().replace(/[^a-z0-9_]/g, "");
      var newDisplayName = body.Display_Name || body.Name || newSlug;
      if (!newSlug) return createJsonResponse({ success: false, error: "Athlete name is required" });
      
      // Auto-provision their logs & templates
      resolveSheetName(ss, "Logs", newSlug);
      resolveSheetName(ss, "Templates", newSlug);
      
      athSheet.appendRow([newSlug, newDisplayName, "Active", new Date().toISOString()]);
      return createJsonResponse({ success: true, message: "Athlete registered successfully!", Athlete_ID: newSlug, Display_Name: newDisplayName });
    }

    // Handle DELETE_ATHLETE action
    if (body.action === "DELETE_ATHLETE") {
      var targetSlug = (body.Athlete_ID || body.athlete || "").trim().toLowerCase().replace(/[^a-z0-9_]/g, "");
      if (!targetSlug || targetSlug === "duy") {
        return createJsonResponse({ success: false, error: "Cannot delete primary coach profile" });
      }
      
      var allSheets = ss.getSheets();
      allSheets.forEach(function(s) {
        var sName = s.getName().toLowerCase();
        if (sName === "logs_" + targetSlug || sName === "templates_" + targetSlug) {
          ss.deleteSheet(s);
        }
      });
      
      var athSheet = ss.getSheetByName("Athletes");
      if (athSheet) {
        var data = athSheet.getDataRange().getValues();
        for (var r = data.length - 1; r >= 1; r--) {
          if (String(data[r][0]).trim().toLowerCase() === targetSlug) {
            athSheet.deleteRow(r + 1);
          }
        }
      }
      return createJsonResponse({ success: true, message: "Athlete and all associated sheets deleted successfully!" });
    }

    // Handle CLONE_TEMPLATE action (copies routine from Coach to Athlete)
    if (body.action === "CLONE_TEMPLATE") {
      var targetAthlete = (body.targetAthlete || "").trim().toLowerCase();
      var sourceTpl = body.template;
      if (!targetAthlete || !sourceTpl) return createJsonResponse({ success: false, error: "Missing targetAthlete or template" });
      
      var targetSheet = resolveSheetName(ss, "Templates", targetAthlete);
      var targetHeaders = ensureSchema(targetSheet, "Templates_" + targetAthlete);
      var row = targetHeaders.map(function(h) {
        if (h === "Template_ID") return "TPL-" + Date.now();
        if (h === "Template_Name") return sourceTpl.Template_Name || "";
        if (h === "Exercise_Sequence") return sourceTpl.Exercise_Sequence || "";
        return "";
      });
      targetSheet.appendRow(row);
      return createJsonResponse({ success: true, message: "Template assigned to " + targetAthlete });
    }

    // Handle DELETE_EXERCISE action
    if (body.action === "DELETE_EXERCISE") {
      var targetName = body.Name || (body.data && body.data.Name);
      var targetId = body.ID || (body.data && body.data.ID);
      var data = sheet.getDataRange().getValues();
      var nameIndex = headers.indexOf("Name");
      var idIndex = headers.indexOf("ID");

      for (var r = data.length - 1; r >= 1; r--) {
        if ((targetName && nameIndex !== -1 && String(data[r][nameIndex]) === String(targetName)) ||
            (targetId && idIndex !== -1 && String(data[r][idIndex]) === String(targetId))) {
          sheet.deleteRow(r + 1);
          return createJsonResponse({ success: true, message: "Exercise deleted successfully!" });
        }
      }
      return createJsonResponse({ success: true, message: "Exercise already deleted or not found" });
    }
    
    // Handle DELETE action
    if (body.action === "DELETE") {
      var targetId = String(body.Log_ID || (body.data && body.data.Log_ID));
      var data = sheet.getDataRange().getValues();
      var idIndex = headers.indexOf("Log_ID");
      if (idIndex === -1) throw new Error("Log_ID column not found");
      
      for (var r = data.length - 1; r >= 1; r--) {
        var cellVal = data[r][idIndex];
        if (String(cellVal) === targetId || (!isNaN(cellVal) && Number(cellVal) === Number(targetId))) {
          sheet.deleteRow(r + 1);
          return createJsonResponse({ success: true, message: "Row deleted successfully!" });
        }
      }
      return createJsonResponse({ success: true, message: "Log_ID already deleted or not found" });
    }
    
    // Handle UPDATE action
    if (body.action === "UPDATE") {
      var targetId = String(body.Log_ID || (body.data && body.data.Log_ID));
      var newWeight = body.Weight != null ? body.Weight : (body.data && body.data.Weight != null ? body.data.Weight : "");
      var newReps = body.Reps != null ? body.Reps : (body.data && body.data.Reps != null ? body.data.Reps : "");
      var data = sheet.getDataRange().getValues();
      var idIndex = headers.indexOf("Log_ID");
      var weightIndex = headers.indexOf("Weight");
      var repsIndex = headers.indexOf("Reps");
      if (idIndex === -1) throw new Error("Log_ID column not found");
      
      for (var r = 1; r < data.length; r++) {
        var cellVal = data[r][idIndex];
        if (String(cellVal) === targetId || (!isNaN(cellVal) && Number(cellVal) === Number(targetId))) {
          var updatedRow = data[r].slice();
          if (weightIndex !== -1) updatedRow[weightIndex] = newWeight;
          if (repsIndex !== -1) updatedRow[repsIndex] = newReps;
          sheet.getRange(r + 1, 1, 1, headers.length).setValues([updatedRow]);
          return createJsonResponse({ success: true, message: "Log updated successfully!" });
        }
      }
      return createJsonResponse({ success: false, error: "Log_ID not found: " + targetId });
    }

    // Handle UPDATE_TEMPLATE action
    if (body.action === "UPDATE_TEMPLATE") {
      var targetId = body.Template_ID || (body.data && body.data.Template_ID);
      var oldName = body.old_Template_Name || body.Template_Name || (body.data && (body.data.old_Template_Name || body.data.Template_Name));
      var newName = body.new_Template_Name || body.Template_Name || (body.data && (body.data.new_Template_Name || body.data.Template_Name));
      var newSeq = body.Exercise_Sequence || (body.data && body.data.Exercise_Sequence) || "";
      
      var data = sheet.getDataRange().getValues();
      var idIndex = headers.indexOf("Template_ID");
      var nameIndex = headers.indexOf("Template_Name");
      var seqIndex = headers.indexOf("Exercise_Sequence");
      
      for (var r = 1; r < data.length; r++) {
        var match = false;
        if (targetId && idIndex !== -1 && String(data[r][idIndex]) === String(targetId)) {
          match = true;
        } else if (oldName && nameIndex !== -1 && String(data[r][nameIndex]) === String(oldName)) {
          match = true;
        }
        if (match) {
          var updatedRow = data[r].slice();
          if (nameIndex !== -1 && newName) updatedRow[nameIndex] = newName;
          if (seqIndex !== -1 && newSeq) updatedRow[seqIndex] = newSeq;
          sheet.getRange(r + 1, 1, 1, headers.length).setValues([updatedRow]);
          return createJsonResponse({ success: true, message: "Template updated successfully!" });
        }
      }
      return createJsonResponse({ success: false, error: "Template not found" });
    }

    // Handle DELETE_TEMPLATE action
    if (body.action === "DELETE_TEMPLATE") {
      var targetId = body.Template_ID || (body.data && body.data.Template_ID);
      var targetName = body.Template_Name || (body.data && body.data.Template_Name);
      
      var data = sheet.getDataRange().getValues();
      var idIndex = headers.indexOf("Template_ID");
      var nameIndex = headers.indexOf("Template_Name");
      
      for (var r = data.length - 1; r >= 1; r--) {
        var match = false;
        if (targetId && idIndex !== -1 && String(data[r][idIndex]) === String(targetId)) {
          match = true;
        } else if (targetName && nameIndex !== -1 && String(data[r][nameIndex]) === String(targetName)) {
          match = true;
        }
        if (match) {
          sheet.deleteRow(r + 1);
          return createJsonResponse({ success: true, message: "Template deleted successfully!" });
        }
      }
      return createJsonResponse({ success: true, message: "Template already deleted or not found" });
    }

    // Handle BATCH_APPEND action
    if (body.action === "BATCH_APPEND" && Array.isArray(body.items)) {
      var clientIndex = headers.indexOf("Client_ID");
      var existingClients = {};
      if (clientIndex !== -1 && sheet.getLastRow() > 1) {
        var clientCol = sheet.getRange(2, clientIndex + 1, sheet.getLastRow() - 1, 1).getValues();
        for (var c = 0; c < clientCol.length; c++) {
          if (clientCol[c][0]) existingClients[String(clientCol[c][0])] = true;
        }
      }
      
      var rowsToAppend = [];
      body.items.forEach(function(item) {
        if (clientIndex !== -1 && item.Client_ID && existingClients[String(item.Client_ID)]) {
          return; // Skip duplicate
        }
        if (clientIndex !== -1 && item.Client_ID) {
          existingClients[String(item.Client_ID)] = true;
        }
        var row = headers.map(function(h) {
          if (h === 'Date' && !item[h]) return formatDateLocal(new Date());
          if (h === 'Timestamp' && !item[h]) return new Date().toISOString();
          return item[h] != null ? item[h] : "";
        });
        rowsToAppend.push(row);
      });
      
      if (rowsToAppend.length > 0) {
        sheet.getRange(sheet.getLastRow() + 1, 1, rowsToAppend.length, headers.length).setValues(rowsToAppend);
      }
      return createJsonResponse({ success: true, message: "Batch append complete", count: rowsToAppend.length });
    }
    
    // Default single append
    if (!body.data) throw new Error("Invalid payload: missing data object");
    var newRow = headers.map(function(header) {
      if (header === 'Date' && !body.data[header]) {
         return formatDateLocal(new Date());
      }
      if (header === 'Timestamp' && !body.data[header]) {
         return new Date().toISOString();
      }
      return body.data[header] != null ? body.data[header] : "";
    });
    
    sheet.appendRow(newRow);
    return createJsonResponse({ success: true, message: "Successfully logged!" });
  } catch (error) {
    return createJsonResponse({ success: false, error: error.toString() });
  } finally {
    lock.releaseLock();
  }
}

// Helper to handle CORS properly
function createJsonResponse(data) {
  return ContentService.createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}
