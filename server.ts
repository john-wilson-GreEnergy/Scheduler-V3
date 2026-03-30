import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { Resend } from "resend";
import dotenv from "dotenv";
import promotionRoutes from "./server/routes/promotion.ts";

dotenv.config();

let resendClient: Resend | null = null;

function getResendClient() {
  if (!resendClient) {
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
      console.warn("RESEND_API_KEY is not set. Email notifications will be disabled.");
      return null;
    }
    resendClient = new Resend(apiKey);
  }
  return resendClient;
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  app.use("/api", promotionRoutes);

  // API routes
  app.post("/api/send-email", async (req, res) => {
    const { to, subject, employeeName, updateType, jobsiteName, weekStartDate, updateDetails, previousAssignment, newAssignment, travelDate } = req.body;
    
    const resend = getResendClient();
    if (!resend) {
      return res.status(503).json({ success: false, error: "Email service is not configured (missing API key)." });
    }

    try {
      const data = await resend.emails.send({
        from: 'GreEnergy Scheduler <notifications@greenergyresources.org>',
        to: to,
        subject: subject,
        html: `
          <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; color: #1f2937;">
            <h1 style="color: #059669; font-size: 24px; margin-bottom: 20px;">GreEnergy Scheduler</h1>
            <p style="font-size: 16px;">Hello ${employeeName},</p>
            <p style="font-size: 16px; line-height: 1.5;">This is an automated notification from the GreEnergy Scheduler system.</p>
            <p style="font-size: 16px; line-height: 1.5;">Your schedule information has been updated. Please review the details below.</p>
            
            <div style="margin: 20px 0; padding: 15px; border: 1px solid #e5e7eb; border-radius: 8px; background-color: #f9fafb; white-space: pre-wrap; font-family: monospace;">
              ${updateDetails}
            </div>

            <p style="font-size: 16px; line-height: 1.5;">If you have questions regarding this change, please contact your Site Manager or the scheduling administrator.</p>
            
            <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #e5e7eb; font-size: 12px; color: #6b7280;">
              <p>This message was generated automatically by the GreEnergy Scheduler system.</p>
              <p>Please do not reply to this email.</p>
              <p>GreEnergy Resources LLC | Automated Notification System</p>
            </div>
          </div>
        `,
      });
      res.json({ success: true, data });
    } catch (error) {
      console.error('Error sending email:', error);
      res.status(500).json({ success: false, error });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
