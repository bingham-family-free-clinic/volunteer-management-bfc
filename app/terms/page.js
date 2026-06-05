export default function TermsOfService() {
  return (
    <main style={{ maxWidth: '720px', margin: '4rem auto', padding: '0 1.5rem 6rem', fontFamily: 'DM Sans, sans-serif', lineHeight: 1.8, color: 'var(--fg, #e2e8f0)' }}>
      <h1 style={{ fontWeight: 700, fontSize: '1.75rem', marginBottom: '0.25rem' }}>Terms of Service</h1>
      <p style={{ color: 'var(--muted, #94a3b8)', fontSize: '0.85rem', marginBottom: '2rem' }}>Effective date: June 5, 2025 &nbsp;·&nbsp; Last updated: June 5, 2025</p>

      <p>These Terms of Service ("Terms") govern your access to and use of the volunteer management application operated by Bingham Family Free Clinic ("Clinic," "we," "us," or "our"). By logging in or using the App, you agree to these Terms.</p>

      <h2 style={h2}>1. Eligibility</h2>
      <p>The App is intended for use by authorized volunteers, staff, and administrators of Bingham Family Free Clinic. You may only use the App if you have been granted an account by a clinic administrator. You are responsible for keeping your login credentials confidential and for all activity that occurs under your account.</p>

      <h2 style={h2}>2. Acceptable Use</h2>
      <p>You agree to use the App only for its intended purpose: coordinating your volunteer activities with the Clinic. You agree not to:</p>
      <ul style={ul}>
        <li>Share your account credentials with others.</li>
        <li>Access or attempt to access any account or data that is not yours.</li>
        <li>Use the App to harass, threaten, or harm other users.</li>
        <li>Transmit any false, misleading, or unauthorized information.</li>
        <li>Attempt to reverse-engineer, modify, or disrupt the App or its infrastructure.</li>
        <li>Use the App for any purpose unrelated to your volunteer role at the Clinic.</li>
      </ul>

      <h2 style={h2}>3. Volunteer Responsibilities</h2>
      <p>You are responsible for the accuracy of the information you provide, including your credentials, contact details, and availability. You agree to keep your credential expiration dates and personal information up to date. You understand that providing false credential information may result in immediate deactivation of your account.</p>

      <h2 style={h2}>4. Scheduling and Attendance</h2>
      <p>By claiming or accepting a shift in the App, you are committing to fulfill that shift. If you are unable to attend a scheduled shift, you are responsible for notifying the appropriate clinic administrator in a timely manner through the App or other designated channels.</p>

      <h2 style={h2}>5. Privacy</h2>
      <p>Your use of the App is also governed by our <a href="/privacy" style={{ color: 'var(--accent, #38bdf8)' }}>Privacy Policy</a>, which is incorporated into these Terms by reference. By using the App, you consent to the collection and use of your information as described in the Privacy Policy.</p>

      <h2 style={h2}>6. Confidentiality</h2>
      <p>Through your use of the App, you may have access to information about other volunteers, patients, or clinic operations. You agree to keep all such information strictly confidential and not to disclose it to any unauthorized party, consistent with your obligations as a volunteer at the Clinic.</p>

      <h2 style={h2}>7. Account Termination</h2>
      <p>The Clinic reserves the right to deactivate or terminate your account at any time, for any reason, including but not limited to violations of these Terms, inactivity, or the conclusion of your volunteer engagement. You may request deactivation of your account by contacting a clinic administrator.</p>

      <h2 style={h2}>8. Intellectual Property</h2>
      <p>The App and all content, features, and functionality within it are owned by Bingham Family Free Clinic or its licensors. You may not copy, reproduce, or distribute any part of the App without prior written permission.</p>

      <h2 style={h2}>9. Disclaimers</h2>
      <p>The App is provided "as is" without warranties of any kind, express or implied. The Clinic does not warrant that the App will be error-free, uninterrupted, or free of security vulnerabilities. You use the App at your own risk.</p>

      <h2 style={h2}>10. Limitation of Liability</h2>
      <p>To the fullest extent permitted by law, Bingham Family Free Clinic shall not be liable for any indirect, incidental, special, or consequential damages arising out of or related to your use of the App, even if advised of the possibility of such damages.</p>

      <h2 style={h2}>11. Changes to These Terms</h2>
      <p>We may update these Terms from time to time. When we do, we will update the "Last updated" date at the top of this page. Continued use of the App after changes are posted constitutes your acceptance of the revised Terms.</p>

      <h2 style={h2}>12. Governing Law</h2>
      <p>These Terms are governed by and construed in accordance with the laws of the State of Utah, without regard to its conflict of law provisions.</p>

      <h2 style={h2}>13. Contact Us</h2>
      <p>If you have questions about these Terms, please contact:</p>
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