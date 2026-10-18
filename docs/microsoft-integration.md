# Microsoft Entra ID & Microsoft 365 Integration

## 1. App Registration in Microsoft Entra Admin Center

To connect NUTM Learn with the school's approved Microsoft 365 tenant:

1. Sign in to the **Microsoft Entra admin center** as an Application Administrator or Global Administrator.
2. Navigate to **Identity** > **Applications** > **App registrations** > **New registration**.
3. Configure settings:
   - **Name:** `NUTM Learn LMS`
   - **Supported account types:** `Accounts in this organizational directory only (Single tenant - NUTM)`. Do NOT select Multi-tenant or Personal accounts.
   - **Redirect URI (Web):** `https://learn.nutm.edu.ng/api/v1/auth/callback` (or `http://localhost:3000/api/v1/auth/callback` for dev).
4. Save the **Application (client) ID** and **Directory (tenant) ID**.
5. Under **Certificates & secrets**, create a new Client Secret and record its value securely in your enterprise key vault.

---

## 2. API Permissions & Consent

Configure narrowly scoped delegated and application permissions:

### Delegated Permissions (OpenID Connect Sign-In)
- `openid` (Authenticate user)
- `profile` (Retrieve user display name)
- `email` (Retrieve institutional email)
- `User.Read` (Read user basic profile details)

### Application Permissions (For SharePoint Online / Graph Storage)
- Preferred: `Sites.Selected` (Granular permission scoped strictly to the NUTM Learn SharePoint site collection).
- Alternative: `Files.ReadWrite.All` (Requires explicit IT Administrator Consent).

---

## 3. Microsoft Graph SharePoint Storage Setup

1. Create a dedicated SharePoint Online Site Collection: `https://nutm.sharepoint.com/sites/NUTM-Learn`.
2. Locate the default Document Library `DriveId` using Microsoft Graph Explorer:
   ```http
   GET https://graph.microsoft.com/v1.0/sites/nutm.sharepoint.com:/sites/NUTM-Learn:/drives
   ```
3. Populate `SHAREPOINT_SITE_ID` and `SHAREPOINT_DRIVE_ID` in your production environment settings.
4. Set `STORAGE_PROVIDER="sharepoint"` to enable direct Graph uploads.
