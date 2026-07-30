// Code.gs
// This acts as the backend API for your fitness tracker.

function doGet(e) {
  // Example usage: ?type=Exercises
  var sheetType = e.parameter.type || "Exercises";
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(sheetType);
  
  if (!sheet) {
    return createJsonResponse({ error: "Tab not found. Make sure you named the tab '" + sheetType + "'" });
  }
  
  var data = sheet.getDataRange().getValues();
  if (data.length <= 1) return createJsonResponse({ success: true, data: [] });
  
  var headers = data.shift();
  var result = data.map(function(row) {
    var obj = {};
    headers.forEach(function(header, i) {
      // Format dates nicely if it's a date object
      obj[header] = (row[i] instanceof Date) ? row[i].toISOString().split('T')[0] : row[i];
    });
    return obj;
  });
  
  return createJsonResponse({ success: true, data: result });
}

function doPost(e) {
  // Example payload: { "type": "Logs", "data": { "Log_ID": "123", "Weight": 135 } }
  try {
    var body = JSON.parse(e.postData.contents);
    if (!body || !body.data) throw new Error("Invalid payload: missing data object");
    var sheetType = body.type; 
    var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(sheetType);
    
    if (!sheet) {
      return createJsonResponse({ error: "Tab not found: " + sheetType });
    }
    
    var lastCol = sheet.getLastColumn();
    if (lastCol === 0) throw new Error("Tab '" + sheetType + "' is empty and has no headers. Add headers to Row 1.");
    var headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
    
    // Map the incoming JSON data to the correct columns dynamically
    var newRow = headers.map(function(header) {
      if (header === 'Date' && !body.data[header]) {
         return new Date().toISOString().split('T')[0];
      }
      return body.data[header] != null ? body.data[header] : "";
    });
    
    sheet.appendRow(newRow);
    
    return createJsonResponse({ success: true, message: "Successfully logged!" });
  } catch (error) {
    return createJsonResponse({ error: error.toString() });
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
  logs.getRange("A1:F1").setValues([["Log_ID", "Workout_ID", "Date", "Exercise_ID", "Weight", "Reps"]]);
  
  var templates = ss.getSheetByName('Templates') || ss.insertSheet('Templates');
  templates.getRange("A1:B1").setValues([["Template_Name", "Exercise_Sequence"]]);
}
