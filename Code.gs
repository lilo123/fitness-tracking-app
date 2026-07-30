// Code.gs
// This acts as the backend API for your fitness tracker.

function formatDateLocal(dateObj) {
  return Utilities.formatDate(dateObj, SpreadsheetApp.getActiveSpreadsheet().getSpreadsheetTimeZone(), "yyyy-MM-dd");
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
      obj[header] = (header === 'Date' && row[i] instanceof Date) ? formatDateLocal(row[i]) : row[i];
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
  return headers;
}

function doPost(e) {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) {
    return createJsonResponse({ success: false, error: "SERVER_BUSY", retryable: true });
  }
  
  try {
    var body = JSON.parse(e.postData.contents);
    if (!body || !body.type) throw new Error("Invalid payload: missing type");
    var sheetType = body.type; 
    var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(sheetType);
    
    if (!sheet) {
      return createJsonResponse({ error: "Tab not found: " + sheetType });
    }
    
    var headers = ensureSchema(sheet, sheetType);
    
    // Handle DELETE action
    if (body.action === "DELETE") {
      var targetId = String(body.Log_ID);
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
