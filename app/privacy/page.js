export default function PrivacyPolicy() {
  return (
    <main style={{ maxWidth: '720px', margin: '4rem auto', padding: '0 1.5rem 6rem', fontFamily: 'DM Sans, sans-serif', lineHeight: 1.8, color: 'var(--fg, #e2e8f0)' }}>
      <h1 style={{ fontWeight: 700, fontSize: '1.75rem', marginBottom: '0.25rem' }}>Privacy Policy</h1>
      <p style={{ color: 'var(--muted, #94a3b8)', fontSize: '0.85rem', marginBottom: '2rem' }}>Effective date: June 5, 2025 &nbsp;·&nbsp; Last updated: June 5, 2025</p>

      <p>Bingham Family Free Clinic ("Clinic," "we," "us," or "our") operates this volunteer management application (the "App") to coordinate scheduling, credentialing, and communications for our volunteers. This Privacy Policy explains what personal information we collect, how we use it, and the choices you have.</p>

      <h2 style={h2}>1. Information We Collect</h2>
      <p>When you use the App, we may collect the following categories of personal information:</p>
      <ul style={ul}>
        <li><strong>Identity &amp; Contact:</strong> full name, email address, phone number, and date of birth.</li>
        <li><strong>Professional Credentials:</strong> role, affiliation, credentials or skills (e.g., EMT, Phlebotomy), languages spoken, license expiration dates, BLS, DEA, FTCA, and TB certification dates.</li>
        <li><strong>Academic &amp; Internship Information:</strong> school, major, advisor name and contact, department, or supervising organization (where applicable).</li>
        <li><strong>Scheduling &amp; Attendance:</strong> shift assignments, clock-in and clock-out records, and availability.</li>
        <li><strong>Communications:</strong> messages sent or received through the App.</li>
        <li><strong>Activity Logs:</strong> records of actions taken within the App (e.g., account changes, status updates).</li>
        <li><strong>Account Credentials:</strong> encrypted passwords managed through our authentication provider.</li>
      </ul>

      <h2 style={h2}>2. How We Use Your Information</h2>
      <p>We use the information we collect to:</p>
      <ul style={ul}>
        <li>Create and manage your volunteer account.</li>
        <li>Schedule and coordinate clinic shifts.</li>
        <li>Track credential expiration dates and ensure compliance.</li>
        <li>Communicate with you about your schedule, role, or clinic operations.</li>
        <li>Maintain an audit log for administrative and safety purposes.</li>
        <li>Improve and maintain the App.</li>
      </ul>
      <p>We do not sell, rent, or share your personal information with third parties for marketing purposes.</p>

      <h2 style={h2}>3. How We Store and Protect Your Information</h2>
      <p>Your data is stored securely using Supabase, a cloud database platform with industry-standard encryption at rest and in transit. Access to personal data is restricted to authorized clinic administrators. We take reasonable technical and organizational measures to protect your information against unauthorized access, loss, or misuse.</p>

      <h2 style={h2}>4. Data Retention</h2>
      <p>We retain your personal information for as long as your volunteer account is active or as needed to operate the App. If you are deactivated or your volunteer engagement ends, your records may be retained for administrative and historical purposes. You may request deletion of your data by contacting us at the address below.</p>

      <h2 style={h2}>5. Your Rights</h2>
      <p>Depending on your state of residence, you may have the right to:</p>
      <ul style={ul}>
        <li>Access the personal information we hold about you.</li>
        <li>Request correction of inaccurate information.</li>
        <li>Request deletion of your personal information.</li>
        <li>Withdraw consent where processing is based on consent.</li>
      </ul>
      <p>To exercise any of these rights, please contact us using the information in Section 8.</p>

      <h2 style={h2}>6. Children's Privacy</h2>
      <p>The App is intended for use by adult volunteers. We do not knowingly collect personal information from individuals under the age of 18 without appropriate consent from a parent or guardian.</p>

      <h2 style={h2}>7. Changes to This Policy</h2>
      <p>We may update this Privacy Policy from time to time. When we do, we will update the "Last updated" date at the top of this page. Continued use of the App after changes are posted constitutes your acceptance of the revised policy.</p>

      <h2 style={h2}>8. Contact Us</h2>
      <p>If you have questions or concerns about this Privacy Policy or your personal data, please contact:</p>
      <p style={{ paddingLeft: '1rem', borderLeft: '3px solid var(--border, #334155)' }}>
        <strong>Bingham Family Free Clinic</strong><br />
        [Clinic Address]<br />
        [City, State, ZIP]<br />
        [contact@email.com]
      </p>

      <p style={{ marginTop: '3rem' }}>
        <a href="/" style={{ color: 'var(--accent, #38bdf8)', textDecoration: 'none', fontSize: '0.9rem' }}>← Back to App</a>
      </p>
    </main>
  )
}

const h2 = { fontWeight: 600, fontSize: '1.1rem', marginTop: '2rem', marginBottom: '0.5rem' }
const ul = { paddingLeft: '1.5rem', marginTop: '0.5rem' }