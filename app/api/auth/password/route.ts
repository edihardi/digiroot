import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";

const ENV_PATH = path.join(process.cwd(), ".env");

// POST /api/auth/password — change dashboard password
export async function POST(req: NextRequest) {
  try {
    const { currentPassword, newPassword } = await req.json();

    if (!currentPassword || !newPassword) {
      return NextResponse.json(
        { error: "Current and new password required" },
        { status: 400 }
      );
    }

    if (newPassword.length < 6) {
      return NextResponse.json(
        { error: "Password minimal 6 karakter" },
        { status: 400 }
      );
    }

    // Verify current password
    const storedPassword = process.env.DASHBOARD_PASSWORD || "Super76##";
    if (currentPassword !== storedPassword) {
      return NextResponse.json(
        { error: "Password lama salah" },
        { status: 403 }
      );
    }

    // Update .env file
    if (fs.existsSync(ENV_PATH)) {
      let envContent = fs.readFileSync(ENV_PATH, "utf8");

      if (envContent.match(/^DASHBOARD_PASSWORD=.*/m)) {
        envContent = envContent.replace(
          /^DASHBOARD_PASSWORD=.*/m,
          `DASHBOARD_PASSWORD="${newPassword}"`
        );
      } else {
        envContent += `\nDASHBOARD_PASSWORD="${newPassword}"\n`;
      }

      const tmpPath = `${ENV_PATH}.tmp.${process.pid}.${Date.now()}`;
      fs.writeFileSync(tmpPath, envContent, "utf8");
      fs.renameSync(tmpPath, ENV_PATH);
    } else {
      fs.writeFileSync(ENV_PATH, `DASHBOARD_PASSWORD="${newPassword}"\n`, "utf8");
    }

    // Update runtime env so it takes effect immediately
    process.env.DASHBOARD_PASSWORD = newPassword;

    return NextResponse.json({ success: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Gagal ganti password";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
