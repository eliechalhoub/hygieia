// Shared timing for the demo video (demo-video.ts) and its narration (demo-voiceover.ts).

/** Intro cards, in seconds: the name, the challenge, the team. 20 seconds in all. */
export const INTRO_S = [4.5, 7, 8.5];
export const INTRO_TOTAL_S = INTRO_S.reduce((a, b) => a + b, 0);
/** The recorded walkthrough. */
export const BODY_S = 82;
/** Thank-you card. */
export const END_S = 8;
export const TOTAL_S = INTRO_TOTAL_S + BODY_S + END_S;

export const TEAM = ["Joelle El Homsi", "Elie Chalhoub", "Rahma Bezzaouia", "Ahmad Abu Zainab"];
export const CHALLENGE = ["Create Health Monitoring Software", "for Astronauts on Space Missions"];
