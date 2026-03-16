import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { Resend } from "resend";
import dotenv from "dotenv";

dotenv.config();

const resend = new Resend(process.env.RESEND_API_KEY);

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // API routes
  app.post("/api/send-email", async (req, res) => {
    const { to, subject, employeeName, updateType, jobsiteName, weekStartDate, updateDetails, previousAssignment, newAssignment, travelDate } = req.body;
    try {
      const data = await resend.emails.send({
        from: 'GreEnergy Scheduler <onboarding@resend.dev>',
        to: to,
        subject: subject,
        html: `
          <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; color: #1f2937;">
            <h1 style="color: #059669; font-size: 24px; margin-bottom: 20px;">GreEnergy Scheduler</h1>
            <p style="font-size: 16px;">Hello ${employeeName},</p>
            <p style="font-size: 16px; line-height: 1.5;">This is an automated notification from the GreEnergy Scheduler system.</p>
            <p style="font-size: 16px; line-height: 1.5;">Your schedule information has been updated. Please review the details below.</p>
            
            <div style="margin: 20px 0; padding: 15px; border: 1px solid #e5e7eb; border-radius: 8px; background-color: #f9fafb;">
              <p style="margin: 5px 0;"><strong>Update Type:</strong> ${updateType}</p>
              <p style="margin: 5px 0;"><strong>Employee:</strong> ${employeeName}</p>
              <p style="margin: 5px 0;"><strong>Jobsite:</strong> ${jobsiteName}</p>
              <p style="margin: 5px 0;"><strong>Week Of:</strong> ${weekStartDate}</p>
              <p style="margin: 5px 0;"><strong>Details:</strong> ${updateDetails}</p>
              ${previousAssignment ? `<p style="margin: 5px 0;"><strong>Previous Assignment:</strong> ${previousAssignment}</p>` : ''}
              ${newAssignment ? `<p style="margin: 5px 0;"><strong>New Assignment:</strong> ${newAssignment}</p>` : ''}
              ${travelDate ? `<p style="margin: 5px 0;"><strong>Travel Date:</strong> ${travelDate}</p>` : ''}
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
