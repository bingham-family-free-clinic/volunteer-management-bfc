export default function TermsOfService() {
  return (
    <main style={{ maxWidth: '720px', margin: '4rem auto', padding: '0 1.5rem 6rem', fontFamily: 'DM Sans, sans-serif', lineHeight: 1.8, color: 'var(--fg, #1e293b)' }}>
      <h1 style={{ fontWeight: 700, fontSize: '1.75rem', marginBottom: '0.25rem' }}>Terms of Service</h1>
      <p style={{ color: 'var(--muted, #475569)', fontSize: '0.85rem', marginBottom: '2rem' }}>Effective date: June x, 2025 &nbsp;·&nbsp; Last updated: June 5, 2025</p>

      <p>These Terms of Service ("Terms") govern your access to and use of the volunteer management application operated by Bingham Family Free Clinic ("Clinic," "we," "us," or "our"). By logging in or using the App, you agree to these Terms.</p>

      <h2 style={h2}>1. Eligibility</h2>
      <p>The App is intended for use by authorized volunteers, staff, and administrators of Bingham Family Free Clinic. You may only use the App if you have been granted an account by a clinic administrator. You are responsible for keeping your login credentials confidential and for all activity that occurs under your account.</p>

      <h2 style={h2}>2. Acceptable Use</h2>
      <p>You agree to use the App only for its intended purpose. You agree not to:</p>
      <ul style={ul}>
        <li>- Share your account credentials with others.</li>
        <li>- Access or attempt to access any account or data that is not yours.</li>
        <li>- Use the App to harass, threaten, or harm other users.</li>
        <li>- Transmit any false, misleading, or unauthorized information.</li>
        <li>- Attempt to reverse-engineer, modify, or disrupt the App or its infrastructure.</li>
        <li>- Use the App for any purpose unrelated to your volunteer role at the Clinic.</li>
      </ul>

      <h2 style={h2}>3. Privacy</h2>
      <p>Your use of the App is also governed by our <a href="/privacy" style={{ color: 'var(--accent, #38bdf8)' }}>Privacy Policy</a>, which is incorporated into these Terms by reference. By using the App, you consent to the collection and use of your information as described in the Privacy Policy.</p>

      <h2 style={h2}>4. Confidentiality</h2>
      <p>Through your use of the App, you may have access to information about other volunteers, patients, or clinic operations. You agree to keep all such information strictly confidential and not to disclose it to any unauthorized party, consistent with your obligations as a volunteer at the Clinic.</p>

      <h2 style={h2}>5. Account Termination</h2>
      <p>The Clinic reserves the right to deactivate or terminate your account at any time, for any reason, including but not limited to violations of these Terms, inactivity, or the conclusion of your volunteer engagement. You may request deactivation of your account by contacting a clinic administrator.</p>

        <h2 style={h2}>6. Intellectual Property</h2>

        <p>
        The App was originally developed by Joshua Kent for the Bingham Family Free Clinic.
        Copyright in the software remains with the original developer.
        </p>

        <p>
        The Bingham Family Free Clinic is granted a perpetual, royalty-free license to use, operate,
        maintain, modify, and enhance the App. This license includes the right to assign or delegate
        these permissions to employees, volunteers, contractors, and future developers engaged by the
        Clinic.
        </p>

        <p>
        All clinic data, records, content, branding, and materials remain the sole property of the
        Bingham Family Free Clinic.
        </p>

        <p>
        Except as expressly permitted above, you may not copy, reproduce, distribute, or create
        derivative works based on the App without prior written permission from the applicable rights holder.
        </p>

      <h2 style={h2}>7. Disclaimers</h2>
      <p>The App is provided "as is" without warranties of any kind, express or implied. The Clinic does not warrant that the App will be error-free, uninterrupted, or free of security vulnerabilities. You use the App at your own risk.</p>

      <h2 style={h2}>8. Limitation of Liability</h2>
      <p>To the fullest extent permitted by law, Bingham Family Free Clinic shall not be liable for any indirect, incidental, special, or consequential damages arising out of or related to your use of the App, even if advised of the possibility of such damages.</p>

      <h2 style={h2}>9. Changes to These Terms</h2>
      <p>We may update these Terms from time to time. When we do, we will update the "Last updated" date at the top of this page. Continued use of the App after changes are posted constitutes your acceptance of the revised Terms.</p>

      <h2 style={h2}>10. Contact Us</h2>
      <p>If you have questions about these Terms, please contact:</p>
      <p style={{ paddingLeft: '1rem', borderLeft: '3px solid var(--border, #334155)' }}>
      <strong>Bingham Family Free Clinic</strong><br />
      987 South Geneva Road Suite 141<br />
      Orem, UT 84058<br />
      info@binghamfamilyclinic.org
      </p>

      <p style={{ marginTop: '3rem' }}>
        <a href="/" style={{ color: 'var(--accent, #38bdf8)', textDecoration: 'none', fontSize: '0.9rem' }}>← Back to App</a>
      </p>
    </main>
  )
}

const h2 = { fontWeight: 600, fontSize: '1.1rem', marginTop: '2rem', marginBottom: '0.5rem' }
const ul = { paddingLeft: '1.5rem', marginTop: '0.5rem' }