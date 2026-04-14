# Problem Statement

## Target User
Employees at InspireWorks who need to report a workplace incident — anonymously or otherwise — without having to navigate a form, send an email, or find the right person to talk to.

## Business Context
InspireWorks is a mid-size organisation with staff across multiple departments. Incidents — maintenance issues, safety hazards, interpersonal conflicts, security breaches — happen regularly but often go unreported because the process is too slow, too visible, or too intimidating. HR and facilities teams miss incidents they should be acting on.

The agent represents InspireWorks' internal incident reporting line. It is not a customer-facing product.

## Core Functions
1. **Classify the incident** — maintenance, safety, interpersonal, or security
2. **Collect details** — what happened, where, when, whether anyone was injured
3. **Assess severity** — low, medium, high, or critical based on actual impact
4. **Log the incident** to a database with full context
5. **Notify the right people** — HR always, manager only with caller consent or for high-severity cases

## Edge Cases
- **Anonymous callers** — caller number is never stored; agent proceeds without asking for identity
- **Distressed callers** — agent acknowledges before asking questions
- **Vague callers** — one gentle follow-up, then logs what it has
- **Third-party reporters** — collects details about the victim, notes caller is reporting on behalf of someone else
- **Retaliation fear** — agent acknowledges protection from retaliation
- **Off-topic calls** — agent redirects politely and offers to log something if relevant
- **Emergency in progress** — agent prompts caller to contact emergency services before logging

## Success Metrics
- Every call results in either a logged incident or a logged abandoned session
- HR receives an SMS within 30 seconds of the call ending
- No duplicate incidents created per call
- Caller never waits more than 2 seconds for the agent to respond after speaking
- Call ends cleanly — agent says goodbye and hangs up, caller does not have to disconnect first
