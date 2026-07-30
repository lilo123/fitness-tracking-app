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

function doGet(e) {
  var sheetType = e.parameter.type || "Exercises";
  var allowedTabs = ["Exercises", "Workouts", "Logs", "Templates"];
  if (allowedTabs.indexOf(sheetType) === -1) {
    return createJsonResponse({ error: "Invalid tab specified: " + sheetType });
  }
  
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(sheetType);
  if (!sheet) {
    return createJsonResponse({ error: "Tab not found. Make sure you named the tab '" + sheetType + "'" });
  }
  
  var data = sheet.getDataRange().getValues();
  if (data.length <= 1) {
    if (sheetType === "Exercises") {
      return createJsonResponse({ success: true, data: [
        { ID: "EX-VT1", Name: "Incline Bench Press", Category: "Chest" },
        { ID: "EX-VT2", Name: "Cable Lateral Raises", Category: "Shoulders" },
        { ID: "EX-VT3", Name: "Dips", Category: "Chest / Triceps" },
        { ID: "EX-VT4", Name: "Leg Extension Machine", Category: "Legs" },
        { ID: "EX-VT5", Name: "Overhead Tricep Cable Pull", Category: "Arms" },
        { ID: "EX-VT6", Name: "Leg Raise", Category: "Core" },
        { ID: "EX-VT7", Name: "Lat Pull Down", Category: "Back" },
        { ID: "EX-VT8", Name: "Seated Cable Row", Category: "Back" },
        { ID: "EX-VT9", Name: "Inclined Bicep Curl", Category: "Arms" },
        { ID: "EX-VT10", Name: "Leg Curl", Category: "Legs" },
        { ID: "EX-VT11", Name: "Face Pulls", Category: "Shoulders" },
        { ID: "EX-VT12", Name: "Weighted Sit-Up", Category: "Core" }
      ] });
    }
    if (sheetType === "Templates") {
      return createJsonResponse({ success: true, data: [
        { Template_Name: "Workout A (Push, Quads & Core)", Exercise_Sequence: "Incline Bench Press, Cable Lateral Raises, Dips, Leg Extension Machine, Overhead Tricep Cable Pull, Leg Raise" },
        { Template_Name: "Workout B (Pull, Hamstrings & Core)", Exercise_Sequence: "Lat Pull Down, Seated Cable Row, Inclined Bicep Curl, Leg Curl, Face Pulls, Weighted Sit-Up" }
      ] });
    }
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

function ensureSchema(sheet, sheetType) {
  var lastCol = sheet.getLastColumn();
  if (lastCol === 0) {
    throw new Error("Tab '" + sheetType + "' is empty and has no headers. Add headers to Row 1.");
  }
  var headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
  
  if (sheetType === 'Logs') {
    var requiredCols = ["Log_ID", "Workout_ID", "Date", "Exercise_ID", "Set_Index", "Weight", "Reps", "Client_ID", "Timestamp"];
    requiredCols.forEach(function(col) {
      if (headers.indexOf(col) === -1) {
        lastCol++;
        sheet.getRange(1, lastCol).setValue(col);
        headers.push(col);
      }
    });
  }
  if (sheetType === 'Templates') {
    var requiredCols = ["Template_ID", "Template_Name", "Exercise_Sequence"];
    requiredCols.forEach(function(col) {
      if (headers.indexOf(col) === -1) {
        lastCol++;
        sheet.getRange(1, lastCol).setValue(col);
        headers.push(col);
      }
    });
  }
  return headers;
}

function doPost(e) {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) {
    return createJsonResponse({ success: false, error: "SERVER_BUSY", retryable: true });
  }
  
  try {
    var body = JSON.parse(e.postData.contents);
    if (!body) throw new Error("Invalid payload: missing body");
    var sheetType = body.type || (body.action && body.action.indexOf("TEMPLATE") !== -1 ? "Templates" : "Logs");
    var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(sheetType);
    
    if (!sheet) {
      return createJsonResponse({ error: "Tab not found: " + sheetType });
    }
    
    var headers = ensureSchema(sheet, sheetType);
    
    // Handle DELETE action
    if (body.action === "DELETE") {
      var targetId = String(body.Log_ID || (body.data && body.data.Log_ID));
      var data = sheet.getDataRange().getValues();
      var idIndex = headers.indexOf("Log_ID");
      if (idIndex === -1) throw new Error("Log_ID column not found");
      
      for (var r = data.length - 1; r >= 1; r--) {
        if (String(data[r][idIndex]) === targetId) {
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
        if (String(data[r][idIndex]) === targetId) {
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
          if (seqIndex !== -1) updatedRow[seqIndex] = newSeq;
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

// Add this function if you want to test adding headers manually via script
function setupStandardHeaders() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  
  var exercises = ss.getSheetByName('Exercises') || ss.insertSheet('Exercises');
  exercises.getRange("A1:C1").setValues([["ID", "Name", "Category"]]);
  
  var workouts = ss.getSheetByName('Workouts') || ss.insertSheet('Workouts');
  workouts.getRange("A1:C1").setValues([["Workout_ID", "Date", "Name"]]);
  
  var logs = ss.getSheetByName('Logs') || ss.insertSheet('Logs');
  logs.getRange("A1:I1").setValues([["Log_ID", "Workout_ID", "Date", "Exercise_ID", "Set_Index", "Weight", "Reps", "Client_ID", "Timestamp"]]);
  
  var templates = ss.getSheetByName('Templates') || ss.insertSheet('Templates');
  templates.getRange("A1:B1").setValues([["Template_Name", "Exercise_Sequence"]]);
}
