# FireReach Deployment Guide 🚀

This guide explains how to deploy the FireReach Autonomous Outreach Engine using **Render** (for the backend microservices) and **Vercel** (for the frontend).

## 1. Prepare for GitHub
Since you already have the files in the `FireReach_Github` folder:
1.  Open your terminal in that folder.
2.  Run `git init`.
3.  Run `git add .`.
4.  Run `git commit -m "Deploying FireReach MVP"`.
5.  Create a new repository on GitHub and follow the instructions to push your code.

## 2. Deploying Backend (Render)
You will need to create 5 separate "Web Services" on Render, one for each microservice.

### Base Directory Configuration
To let each service access the `shared/` folder, DO NOT set the "Root Directory" to a subfolder on Render. Instead:
1.  Set the **Root Directory** to `.` (the top level of your repo).
2.  Change your **Start Command** to run the specific service (e.g., `node api-gateway/index.js`).
3.  Set the **Build Command** to `npm install` for the specific folder (e.g., `cd api-gateway && npm install`).

### Services Configuration
Set these environment variables for **each** service (from your `.env`):
*   `GROQ_API_KEY`
*   `SERPER_API_KEY`
*   `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `EMAIL_FROM`

| Service | Build Command | Start Command | Env Var to Add |
| :--- | :--- | :--- | :--- |
| **API Gateway** | `cd api-gateway && npm install` | `node api-gateway/index.js` | `AGENT_SERVICE_URL` (URL of Agent Service) |
| **Agent Service** | `cd agent-service && npm install` | `node agent-service/index.js` | `SIGNAL_SERVICE_URL`, `RESEARCH_SERVICE_URL`, `OUTREACH_SERVICE_URL` |
| **Signal Harvester** | `cd signal-harvester-service && npm install` | `node signal-harvester-service/index.js` | - |
| **Research Analyst** | `cd research-analyst-service && npm install` | `node research-analyst-service/index.js` | - |
| **Outreach Sender** | `cd outreach-sender-service && npm install` | `node outreach-sender-service/index.js` | - |

> **Important:** Once the microservices are deployed, update the `SERVICE_URL` environment variables in the **API Gateway** and **Agent Service** to point to the new Render URLs (e.g., `https://firereach-agent.onrender.com`).

## 3. Deploying Frontend (Vercel)
1.  Import your GitHub repo into Vercel.
2.  Set the **Root Directory** to `frontend`.
3.  Add an environment variable:
    *   `VITE_API_URL`: Use your **Render API Gateway URL**.
4.  Vercel will automatically detect the Vite build and deploy it.

## 4. Final Verification
*   Open the Vercel URL.
*   Ensure the frontend connects to the Render Gateway.
*   Run a test agent to verify the pipeline across the cloud services.
