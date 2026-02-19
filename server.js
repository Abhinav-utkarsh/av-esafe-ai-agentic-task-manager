const express = require("express");
const cors = require("cors");
const path = require("path");
require("dotenv").config();

// Safe fetch for all Node versions
let fetch;
try {
  fetch = global.fetch || require("node-fetch");
} catch {
  fetch = require("node-fetch");
}

const app = express();

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.static(path.join(__dirname, "public")));
app.use("/image", express.static(path.join(__dirname, "image")));

console.log("Loaded OpenRouter Key:", process.env.OPENROUTER_API_KEY);

// Test route
app.get("/api/test", (req, res) => {
  res.json({ message: "Backend running with OpenRouter AI 🚀" });
});

app.post("/optimize", async (req, res) => {
  let aiText = "";

  try {
    const { department, subDepartment, tasks } = req.body;

    if (!tasks || !Array.isArray(tasks) || tasks.length === 0) {
      return res.status(400).json({ error: "Tasks array required." });
    }

    if (!process.env.OPENROUTER_API_KEY) {
      return res.status(500).json({
        error: "OPENROUTER_API_KEY missing in .env"
      });
    }

    // ✅ Only active tasks
    // Limit to 50 tasks to prevent token overflow/timeouts with large imports
    const activeTasks = tasks.filter(t => t.status === "active").slice(0, 50);

    if (activeTasks.length === 0) {
      return res.status(400).json({
        error: "No active tasks available."
      });
    }

    // ✅ Strict UTC date calculation
    const now = new Date();
    const todayUTC = Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth(),
      now.getUTCDate()
    );

    const tasksWithContext = activeTasks.map(task => {
      let daysRemaining = null;
      let urgencyCategory = "No deadline";
      let cleanDeadlineLabel = "";

      if (task.deadline) {
        const parts = task.deadline.split("-");
        if (parts.length === 3) {
          const y = Number(parts[0]);
          const m = Number(parts[1]);
          const d = Number(parts[2]);

          const deadlineUTC = Date.UTC(y, m - 1, d);
          const diffMs = deadlineUTC - todayUTC;

          daysRemaining = Math.floor(diffMs / (1000 * 60 * 60 * 24));

          if (daysRemaining < 0) {
            urgencyCategory = "Overdue";
            cleanDeadlineLabel = "Overdue by " + Math.abs(daysRemaining) + " days";
          } else if (daysRemaining === 0) {
            urgencyCategory = "Due Today";
            cleanDeadlineLabel = "Due Today";
          } else if (daysRemaining <= 3) {
            urgencyCategory = "High Urgency";
            cleanDeadlineLabel = daysRemaining + " days remaining";
          } else if (daysRemaining <= 7) {
            urgencyCategory = "Moderate Urgency";
            cleanDeadlineLabel = daysRemaining + " days remaining";
          } else {
            urgencyCategory = "Stable Timeline";
            cleanDeadlineLabel = daysRemaining + " days remaining";
          }
        }
      }

      return {
        id: task.id,
        title: (task.title || "").substring(0, 50), // Include title for context, truncated
        daysRemaining,
        urgencyCategory,
        cleanDeadlineLabel
      };
    });

    // ✅ Clean strict prompt
    const prompt = `
You are an AI Task Optimization Engine.

Analyze the tasks.
Priority Rules:
Overdue = Critical
Due Today = High
1-3 Days Left = High
4-7 Days Left = Medium
>7 Days = Low
No deadline = Low

Return strictly valid JSON.
IMPORTANT: You must include EVERY task from the input list in the output JSON, even if priority is Low. Do not skip any tasks.

Tasks:
${JSON.stringify(tasksWithContext)}

JSON Structure:
{
  "reorderedTasks": [
    {
      "id": "task_id",
      "priority": "Critical/High/Medium/Low",
      "confidence": 85,
      "reason": "Max 5 words."
    }
  ],
  "summary": "Max 2 sentences executive summary."
}
`;

    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: "Bearer " + process.env.OPENROUTER_API_KEY,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "mistralai/mistral-7b-instruct",
        temperature: 0.1,
        max_tokens: 4000,
        messages: [{ role: "user", content: prompt }]
      })
    });

    const data = await response.json();

    if (!response.ok) {
      console.error("OpenRouter Error:", data);
      return res.status(500).json({
        error: data.error?.message || "OpenRouter API error"
      });
    }

    aiText = data.choices?.[0]?.message?.content || "";

    // Remove markdown blocks
    aiText = aiText.replace(/```json/g, "").replace(/```/g, "").trim();

    // Safe JSON extraction
    const start = aiText.indexOf("{");
    const end = aiText.lastIndexOf("}");

    if (start === -1 || end === -1) {
      throw new Error("AI did not return valid JSON");
    }

    const jsonString = aiText.substring(start, end + 1);
    const parsed = JSON.parse(jsonString);

    // ===== SANITIZE MARKDOWN FROM AI OUTPUT =====
    if (parsed.summary) {
        parsed.summary = parsed.summary.replace(/[*`]/g, '');
    }

    // ===== STRICT PRIORITY ENFORCEMENT & MISSING TASK FILL =====
    const urgencyMap = new Map();
    tasksWithContext.forEach(t => {
        urgencyMap.set(String(t.id), t.urgencyCategory);
    });

    // Ensure reorderedTasks exists
    if (!parsed.reorderedTasks || !Array.isArray(parsed.reorderedTasks)) {
        parsed.reorderedTasks = [];
    }

    const processedIds = new Set();

    // 1. Process returned tasks
    parsed.reorderedTasks.forEach(task => {
        processedIds.add(String(task.id));

        // Sanitize reason
        if (task.reason) task.reason = task.reason.replace(/[*`]/g, '');

        // Enforce Priority Rules
        const category = urgencyMap.get(String(task.id));
        if (category) {
            if (category === "Overdue") task.priority = "Critical";
            else if (category === "Due Today") task.priority = "High";
            else if (category === "High Urgency") task.priority = "High";
            else if (category === "Moderate Urgency") task.priority = "Medium";
            else if (category === "Stable Timeline") task.priority = "Low";
            else if (category === "No deadline") task.priority = "Low";
        }
    });

    // 2. Add missing tasks (Fallbacks for tasks AI skipped)
    tasksWithContext.forEach(t => {
        if (!processedIds.has(String(t.id))) {
            let priority = "Low";
            let reason = "Timeline is stable.";
            
            if (t.urgencyCategory === "Overdue") { priority = "Critical"; reason = "Task is overdue."; }
            else if (t.urgencyCategory === "Due Today") { priority = "High"; reason = "Due today."; }
            else if (t.urgencyCategory === "High Urgency") { priority = "High"; reason = "Approaching deadline."; }
            else if (t.urgencyCategory === "Moderate Urgency") { priority = "Medium"; reason = "Upcoming deadline."; }
            else if (t.urgencyCategory === "Stable Timeline") { priority = "Low"; reason = "Timeline is stable."; }
            else if (t.urgencyCategory === "No deadline") { priority = "Low"; reason = "No deadline set."; }

            parsed.reorderedTasks.push({
                id: t.id,
                priority: priority,
                confidence: 90, // High confidence because it's rule-based
                reason: reason
            });
        }
    });
    // =============================================

    res.json(parsed);

  } catch (error) {
    console.error("Optimization Error:", error.message);
    console.error("Raw AI Response:", aiText);

    res.status(500).json({
      error: "Optimization failed",
      details: error.message
    });
  }
});

app.post("/parse-tasks", async (req, res) => {
  try {
    const { text } = req.body;
    if (!text) return res.status(400).json({ error: "Text required" });

    if (!process.env.OPENROUTER_API_KEY) {
      return res.status(500).json({ error: "API Key missing" });
    }

    const prompt = `
You are an AI Task Extractor.
Analyze the following document text and extract actionable tasks.

Return a strict JSON object with a "tasks" key containing an array of objects.
Each object must have:
- title: (string) Clear task name
- description: (string) Brief details
- deadline: (string) YYYY-MM-DD format if mentioned, else null

Text to analyze:
${text.substring(0, 15000)} 
`;

    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: "Bearer " + process.env.OPENROUTER_API_KEY,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "mistralai/mistral-7b-instruct",
        temperature: 0.1,
        max_tokens: 4000,
        messages: [{ role: "user", content: prompt }]
      })
    });

    const data = await response.json();
    if (!response.ok) throw new Error(data.error?.message || "AI Error");

    let aiText = data.choices?.[0]?.message?.content || "";
    aiText = aiText.replace(/```json/g, "").replace(/```/g, "").trim();
    
    const start = aiText.indexOf("{");
    const end = aiText.lastIndexOf("}");
    if (start === -1 || end === -1) throw new Error("Invalid JSON from AI");
    
    const json = JSON.parse(aiText.substring(start, end + 1));
    res.json(json);

  } catch (error) {
    console.error("Parse Tasks Error:", error);
    res.status(500).json({ error: "Failed to parse tasks" });
  }
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log("Server running at http://localhost:" + PORT);
});
