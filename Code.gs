// Code.gs
// Multi-Athlete Coaching Engine Backend API for Cyber-Gym.

function formatDateLocal(dateObj, tz) {
  if (!dateObj) return "";
  if (typeof dateObj === "string") {
    var match = dateObj.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
    if (match) {
      return match[1] + "-" + ("0" + match[2]).slice(-2) + "-" + ("0" + match[3]).slice(-2);
    }
    dateObj = new Date(dateObj);
  }
  if (dateObj instanceof Date && !isNaN(dateObj.getTime())) {
    return Utilities.formatDate(dateObj, tz || "UTC", "yyyy-MM-dd");
  }
  return String(dateObj);
}

function resolveSheetName(ss, requestedType, athleteId) {
  var cleanAthlete = (athleteId || "duy").trim().toLowerCase().replace(/[^a-z0-9_]/g, "");
  
  if (requestedType === "Exercises") {
    var exSheet = ss.getSheetByName("Exercises");
    if (!exSheet) {
      exSheet = ss.insertSheet("Exercises");
      exSheet.getRange(1, 1, 1, 3).setValues([["ID", "Name", "Category"]]);
      var defaultExercises = [
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
      exSheet.getRange(2, 1, defaultExercises.length, 3).setValues(defaultExercises);
    }
    return exSheet;
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
      tplSheet.getRange(1, 1, 1, 4).setValues([["Template_Name", "Exercise_Sequence", "Target_Sets", "Day_Of_Week"]]);
      var defaultTemplates = [
        ["Workout A (Push, Quads & Core)", "Incline Bench Press, Cable Lateral Raises, Dips, Leg Extension Machine, Overhead Tricep Cable Pull, Leg Raise", "4, 3, 3, 3, 3, 3", "Monday, Thursday"],
        ["Workout B (Pull, Hamstrings & Core)", "Lat Pull Down, Seated Cable Row, Inclined Bicep Curl, Leg Curl, Face Pulls, Weighted Sit-Up", "4, 3, 3, 3, 3, 3", "Tuesday, Friday"]
      ];
      tplSheet.getRange(2, 1, defaultTemplates.length, 4).setValues(defaultTemplates);
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
      sheet.getRange(1, 1, 1, 4).setValues([["Template_Name", "Exercise_Sequence", "Target_Sets", "Day_Of_Week"]]);
      return ["Template_Name", "Exercise_Sequence", "Target_Sets", "Day_Of_Week"];
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
    var requiredTplCols = ["Template_Name", "Exercise_Sequence", "Target_Sets", "Day_Of_Week"];
    requiredTplCols.forEach(function(col) {
      if (headers.indexOf(col) === -1) {
        lastCol++;
        sheet.getRange(1, lastCol).setValue(col);
        headers.push(col);
      }
    });
  }
  return headers;
}

function doGet(e) {
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var tz = ss.getSpreadsheetTimeZone();
    var sheetType = (e && e.parameter && e.parameter.type) || "Exercises";
    var athlete = (e && e.parameter && e.parameter.athlete) || "duy";
    
    var sheet = resolveSheetName(ss, sheetType, athlete);
    if (!sheet) {
      return createJsonResponse({ success: false, error: "Tab not found: " + sheetType });
    }
    
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
    
    var data = sheet.getDataRange().getValues();
    if (data.length <= 1) {
      return createJsonResponse({ success: true, data: [] });
    }
    
    var headers = data.shift();
    var result = data.map(function(row) {
      var obj = {};
      headers.forEach(function(header, i) {
        obj[header] = (header === 'Date' && row[i]) ? formatDateLocal(row[i], tz) : row[i];
      });
      return obj;
    });
    
    return createJsonResponse({ success: true, data: result });
  } catch (err) {
    return createJsonResponse({ success: false, error: err.toString() });
  }
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
    var tz = ss.getSpreadsheetTimeZone();
    var athlete = body.athlete || "duy";
    var sheetType = body.type || (body.action && body.action.indexOf("EXERCISE") !== -1 ? "Exercises" : (body.action && body.action.indexOf("TEMPLATE") !== -1 ? "Templates" : "Logs"));
    var sheet = resolveSheetName(ss, sheetType, athlete);
    
    if (!sheet) {
      return createJsonResponse({ success: false, error: "Tab not found for type: " + sheetType });
    }
    
    var headers = ensureSchema(sheet, sheetType);

    // Handle REGISTER_ATHLETE action
    if (body.action === "REGISTER_ATHLETE") {
      var athSheet = resolveSheetName(ss, "Athletes", "duy");
      var newSlug = (body.Athlete_ID || body.Name || "").trim().toLowerCase().replace(/[^a-z0-9_]/g, "");
      var newDisplayName = body.Display_Name || body.Name || newSlug;
      if (!newSlug) return createJsonResponse({ success: false, error: "Athlete name is required" });
      
      resolveSheetName(ss, "Logs", newSlug);
      resolveSheetName(ss, "Templates", newSlug);
      
      // Check existing before appending
      var athData = athSheet.getDataRange().getValues();
      var alreadyExists = false;
      for (var r = 1; r < athData.length; r++) {
        if (String(athData[r][0]).trim().toLowerCase() === newSlug) {
          alreadyExists = true;
          break;
        }
      }
      if (!alreadyExists) {
        athSheet.appendRow([newSlug, newDisplayName, "Active", new Date().toISOString()]);
      }
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
        var aHeaders = athSheet.getRange(1, 1, 1, athSheet.getLastColumn()).getValues()[0];
        var idIndex = aHeaders.indexOf("Athlete_ID");
        if (idIndex === -1) idIndex = 0;
        var data = athSheet.getDataRange().getValues();
        for (var r = data.length - 1; r >= 1; r--) {
          if (String(data[r][idIndex]).trim().toLowerCase() === targetSlug) {
            athSheet.deleteRow(r + 1);
          }
        }
      }
      return createJsonResponse({ success: true, message: "Athlete and all associated sheets deleted successfully!" });
    }

    // Handle CLONE_TEMPLATE action
    if (body.action === "CLONE_TEMPLATE") {
      var targetAthlete = (body.targetAthlete || "").trim().toLowerCase();
      var sourceTpl = body.template;
      if (!targetAthlete || !sourceTpl) return createJsonResponse({ success: false, error: "Missing targetAthlete or template" });
      
      var targetSheet = resolveSheetName(ss, "Templates", targetAthlete);
      var targetHeaders = ensureSchema(targetSheet, "Templates_" + targetAthlete);
      var row = targetHeaders.map(function(h) {
        if (h === "Template_Name") return sourceTpl.Template_Name || "";
        if (h === "Exercise_Sequence") return sourceTpl.Exercise_Sequence || "";
        if (h === "Target_Sets") return sourceTpl.Target_Sets || "";
        if (h === "Day_Of_Week") return sourceTpl.Day_Of_Week || "";
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
        var rowName = nameIndex !== -1 ? String(data[r][nameIndex]).trim().toLowerCase() : "";
        var rowId = idIndex !== -1 ? String(data[r][idIndex]).trim() : "";
        if ((targetName && rowName === String(targetName).trim().toLowerCase()) ||
            (targetId && rowId === String(targetId).trim())) {
          sheet.deleteRow(r + 1);
          return createJsonResponse({ success: true, message: "Exercise deleted successfully!" });
        }
      }
      return createJsonResponse({ success: true, message: "Exercise already deleted or not found" });
    }
    
    // Handle DELETE action
    if (body.action === "DELETE") {
      var rawId = body.Log_ID != null ? body.Log_ID : (body.data && body.data.Log_ID != null ? body.data.Log_ID : null);
      if (rawId == null || rawId === "" || rawId === "undefined") {
        return createJsonResponse({ success: false, error: "Valid Log_ID required for delete" });
      }
      var targetId = String(rawId).trim();
      var data = sheet.getDataRange().getValues();
      var idIndex = headers.indexOf("Log_ID");
      if (idIndex === -1) throw new Error("Log_ID column not found");
      
      for (var r = data.length - 1; r >= 1; r--) {
        var cellVal = data[r][idIndex];
        if (cellVal != null && cellVal !== "") {
          if (String(cellVal).trim() === targetId || (!isNaN(cellVal) && Number(cellVal) === Number(targetId))) {
            sheet.deleteRow(r + 1);
            return createJsonResponse({ success: true, message: "Row deleted successfully!" });
          }
        }
      }
      return createJsonResponse({ success: true, message: "Log_ID already deleted or not found" });
    }
    
    // Handle UPDATE action (Preserves unsupplied fields)
    if (body.action === "UPDATE") {
      var rawId = body.Log_ID != null ? body.Log_ID : (body.data && body.data.Log_ID != null ? body.data.Log_ID : null);
      if (rawId == null || rawId === "" || rawId === "undefined") {
        return createJsonResponse({ success: false, error: "Valid Log_ID required for update" });
      }
      var targetId = String(rawId).trim();
      var hasWeight = body.Weight != null || (body.data && body.data.Weight != null);
      var hasReps = body.Reps != null || (body.data && body.data.Reps != null);
      var newWeight = hasWeight ? (body.Weight != null ? body.Weight : body.data.Weight) : null;
      var newReps = hasReps ? (body.Reps != null ? body.Reps : body.data.Reps) : null;
      
      var data = sheet.getDataRange().getValues();
      var idIndex = headers.indexOf("Log_ID");
      var weightIndex = headers.indexOf("Weight");
      var repsIndex = headers.indexOf("Reps");
      if (idIndex === -1) throw new Error("Log_ID column not found");
      
      for (var r = 1; r < data.length; r++) {
        var cellVal = data[r][idIndex];
        if (cellVal != null && cellVal !== "") {
          if (String(cellVal).trim() === targetId || (!isNaN(cellVal) && Number(cellVal) === Number(targetId))) {
            var updatedRow = data[r].slice(0, headers.length);
            if (hasWeight && weightIndex !== -1) updatedRow[weightIndex] = newWeight;
            if (hasReps && repsIndex !== -1) updatedRow[repsIndex] = newReps;
            sheet.getRange(r + 1, 1, 1, headers.length).setValues([updatedRow]);
            return createJsonResponse({ success: true, message: "Log updated successfully!" });
          }
        }
      }
      return createJsonResponse({ success: false, error: "Log_ID not found: " + targetId });
    }

    // Handle UPDATE_TEMPLATE action
    if (body.action === "UPDATE_TEMPLATE") {
      var oldName = (body.old_Template_Name || body.Template_Name || (body.data && (body.data.old_Template_Name || body.data.Template_Name)) || "").trim().toLowerCase();
      var newName = body.new_Template_Name || body.Template_Name || (body.data && (body.data.new_Template_Name || body.data.Template_Name));
      var newSeq = body.Exercise_Sequence || (body.data && body.data.Exercise_Sequence) || "";
      var hasTargetSets = body.Target_Sets != null || (body.data && body.data.Target_Sets != null);
      var newTargetSets = hasTargetSets ? (body.Target_Sets != null ? body.Target_Sets : body.data.Target_Sets) : "";
      var hasDayOfWeek = body.Day_Of_Week != null || (body.data && body.data.Day_Of_Week != null);
      var newDayOfWeek = hasDayOfWeek ? (body.Day_Of_Week != null ? body.Day_Of_Week : body.data.Day_Of_Week) : "";
      
      var data = sheet.getDataRange().getValues();
      var nameIndex = headers.indexOf("Template_Name");
      var seqIndex = headers.indexOf("Exercise_Sequence");
      var setsIndex = headers.indexOf("Target_Sets");
      var dayIndex = headers.indexOf("Day_Of_Week");
      if (nameIndex === -1) nameIndex = 0;
      if (seqIndex === -1) seqIndex = 1;
      
      for (var r = 1; r < data.length; r++) {
        var rowName = String(data[r][nameIndex]).trim().toLowerCase();
        if (oldName && rowName === oldName) {
          var updatedRow = data[r].slice(0, headers.length);
          if (nameIndex !== -1 && newName) updatedRow[nameIndex] = newName;
          if (seqIndex !== -1 && newSeq) updatedRow[seqIndex] = newSeq;
          if (setsIndex !== -1 && hasTargetSets) updatedRow[setsIndex] = newTargetSets;
          if (dayIndex !== -1 && hasDayOfWeek) updatedRow[dayIndex] = newDayOfWeek;
          sheet.getRange(r + 1, 1, 1, headers.length).setValues([updatedRow]);
          return createJsonResponse({ success: true, message: "Template updated successfully!" });
        }
      }
      return createJsonResponse({ success: false, error: "Template not found" });
    }

    // Handle DELETE_TEMPLATE action
    if (body.action === "DELETE_TEMPLATE") {
      var targetName = (body.Template_Name || (body.data && body.data.Template_Name) || "").trim().toLowerCase();
      var data = sheet.getDataRange().getValues();
      var nameIndex = headers.indexOf("Template_Name");
      if (nameIndex === -1) nameIndex = 0;
      
      for (var r = data.length - 1; r >= 1; r--) {
        var rowName = String(data[r][nameIndex]).trim().toLowerCase();
        if (targetName && rowName === targetName) {
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
          if (clientCol[c][0]) existingClients[String(clientCol[c][0]).trim()] = true;
        }
      }
      
      var rowsToAppend = [];
      body.items.forEach(function(item) {
        var cId = item.Client_ID ? String(item.Client_ID).trim() : "";
        if (clientIndex !== -1 && cId && existingClients[cId]) {
          return; // Skip duplicate
        }
        if (clientIndex !== -1 && cId) {
          existingClients[cId] = true;
        }
        var row = headers.map(function(h) {
          if (h === 'Date' && !item[h]) return formatDateLocal(new Date(), tz);
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
         return formatDateLocal(new Date(), tz);
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

function createJsonResponse(data) {
  return ContentService.createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}
