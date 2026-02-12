const express = require("express");
const cors = require("cors");
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
app.use(express.json());
app.use(express.static("public"));

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
    const activeTasks = tasks.filter(t => t.status === "active");

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
        daysRemaining,
        urgencyCategory,
        cleanDeadlineLabel
      };
    });

    // ✅ Clean strict prompt
    const prompt = `
You are an AI Task Optimization Engine.

Follow these strict priority rules:

Overdue = Critical
Due Today = High
High Urgency = High
Moderate Urgency = Medium
Stable Timeline = Low

Do not override rules.
Do not recalculate deadlines.
Do not mention task titles.
Return valid JSON only.

Tasks:
${JSON.stringify(tasksWithContext)}

Return exactly:

{
  "reorderedTasks": [
    {
      "id": "task_id",
      "priority": "Critical/High/Medium/Low",
      "confidence": 85,
      "reason": "Short professional explanation referencing urgencyCategory."
    }
  ],
  "summary": "4 to 6 sentence professional executive summary without mentioning task names."
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
        max_tokens: 800,
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

    // ===== STRICT PRIORITY ENFORCEMENT (BACKEND OVERRIDE) =====
    // Create a lookup map for urgency categories from the calculated context
    const urgencyMap = new Map();
    tasksWithContext.forEach(t => {
        urgencyMap.set(String(t.id), t.urgencyCategory);
    });

    if (parsed.reorderedTasks && Array.isArray(parsed.reorderedTasks)) {
        parsed.reorderedTasks.forEach(task => {
            // Sanitize reason
            if (task.reason) {
                task.reason = task.reason.replace(/[*`]/g, '');
            }

            // Enforce Priority Rules
            const category = urgencyMap.get(String(task.id));
            
            if (category) {
                if (category === "Overdue") {
                    task.priority = "Critical";
                } else if (category === "Due Today") {
                    task.priority = "High";
                } else if (category === "High Urgency") { // 1-3 days remaining
                    task.priority = "High";
                } else if (category === "Moderate Urgency") {
                    task.priority = "Medium";
                } else if (category === "Stable Timeline") {
                    task.priority = "Low";
                }
            }
        });
    }
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

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log("Server running at http://localhost:" + PORT);
});
