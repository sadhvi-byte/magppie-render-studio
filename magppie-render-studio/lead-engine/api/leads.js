// lead-engine/api/leads.js
//
// Serverless API for Magppie Lead Engine.
// Handles lead capture, scoring, qualification, and pipeline management.
// In production, replace the in-memory store with a database (Supabase, Firebase, etc.)

export const config = { maxDuration: 30 };

// ---- Scoring Weights ----
const SCORING = {
  netWorth: {
    "5cr-10cr": 20,
    "10cr-25cr": 30,
    "25cr-50cr": 38,
    "50cr+": 40,
  },
  propertyType: {
    "apartment-3bhk": 5,
    "apartment-4bhk": 10,
    "penthouse": 18,
    "villa": 20,
    "bungalow": 20,
    "farmhouse": 15,
  },
  city: {
    "mumbai": 10, "delhi": 10, "bangalore": 10, "hyderabad": 9,
    "pune": 8, "chennai": 8, "kolkata": 7, "ahmedabad": 8,
    "goa": 9, "chandigarh": 7, "jaipur": 7, "lucknow": 6,
    "other-metro": 5, "tier2": 3,
  },
  wellnessInterest: {
    "organic-cooking": 8,
    "health-conscious": 7,
    "yoga-fitness": 6,
    "air-water-quality": 9,
    "toxin-free-living": 10,
    "biophilic-design": 8,
    "none": 0,
  },
  kitchenTimeline: {
    "immediate": 20,
    "3-months": 16,
    "6-months": 10,
    "12-months": 5,
    "just-exploring": 2,
  },
  budgetRange: {
    "15-20L": 5,
    "20-30L": 15,
    "30-50L": 18,
    "50L+": 20,
  },
  decisionRole: {
    "self": 10,
    "joint": 7,
    "advisor": 3,
  },
};

const CHANNELS = [
  "architect-referral",
  "designer-referral",
  "real-estate-partner",
  "wellness-event",
  "digital-content",
  "client-referral",
  "luxury-media",
  "walk-in",
  "social-media",
  "other",
];

const FUNNEL_STAGES = [
  "suspect",
  "prospect",
  "mql",
  "sql",
  "proposal",
  "negotiation",
  "won",
  "lost",
];

const TARGET_REVENUE = 2200_00_000; // 22 Crores
const AVG_DEAL = 25_00_000; // 25 Lakhs
const DEALS_NEEDED = Math.ceil(TARGET_REVENUE / AVG_DEAL); // 88

function scoreLead(data) {
  let score = 0;
  const breakdown = {};

  if (data.netWorth && SCORING.netWorth[data.netWorth]) {
    breakdown.netWorth = SCORING.netWorth[data.netWorth];
    score += breakdown.netWorth;
  }

  if (data.propertyType && SCORING.propertyType[data.propertyType]) {
    breakdown.propertyType = SCORING.propertyType[data.propertyType];
    score += breakdown.propertyType;
  }

  if (data.city) {
    const cityKey = data.city.toLowerCase().replace(/\s+/g, "-");
    breakdown.city = SCORING.city[cityKey] || SCORING.city["other-metro"] || 3;
    score += breakdown.city;
  }

  if (Array.isArray(data.wellnessInterests) && data.wellnessInterests.length) {
    const wScore = data.wellnessInterests.reduce((sum, w) => {
      return sum + (SCORING.wellnessInterest[w] || 0);
    }, 0);
    breakdown.wellness = Math.min(wScore, 30);
    score += breakdown.wellness;
  }

  if (data.timeline && SCORING.kitchenTimeline[data.timeline]) {
    breakdown.timeline = SCORING.kitchenTimeline[data.timeline];
    score += breakdown.timeline;
  }

  if (data.budgetRange && SCORING.budgetRange[data.budgetRange]) {
    breakdown.budget = SCORING.budgetRange[data.budgetRange];
    score += breakdown.budget;
  }

  if (data.decisionRole && SCORING.decisionRole[data.decisionRole]) {
    breakdown.decision = SCORING.decisionRole[data.decisionRole];
    score += breakdown.decision;
  }

  const maxScore = 40 + 20 + 10 + 30 + 20 + 20 + 10; // 150
  const normalized = Math.round((score / maxScore) * 100);

  let grade;
  if (normalized >= 75) grade = "A";
  else if (normalized >= 55) grade = "B";
  else if (normalized >= 35) grade = "C";
  else grade = "D";

  let qualification;
  if (normalized >= 70) qualification = "sql";
  else if (normalized >= 45) qualification = "mql";
  else qualification = "prospect";

  return { score: normalized, grade, qualification, breakdown };
}

function estimatedDealValue(data) {
  const base = AVG_DEAL;
  let multiplier = 1;
  if (data.propertyType === "penthouse" || data.propertyType === "villa" || data.propertyType === "bungalow") multiplier = 1.4;
  if (data.budgetRange === "50L+") multiplier = 1.8;
  else if (data.budgetRange === "30-50L") multiplier = 1.3;
  if (data.netWorth === "50cr+") multiplier *= 1.3;
  return Math.round(base * multiplier);
}

function generateChannelTargets() {
  const totalLeads = DEALS_NEEDED * 4;
  return {
    "architect-referral": { target: Math.round(totalLeads * 0.25), label: "Architect & Designer Referrals", conversionRate: 0.35 },
    "real-estate-partner": { target: Math.round(totalLeads * 0.20), label: "Premium Real Estate Partners", conversionRate: 0.28 },
    "wellness-event": { target: Math.round(totalLeads * 0.15), label: "Wellness Events & Retreats", conversionRate: 0.22 },
    "digital-content": { target: Math.round(totalLeads * 0.15), label: "Digital Content & SEO", conversionRate: 0.15 },
    "client-referral": { target: Math.round(totalLeads * 0.12), label: "Existing Client Referrals", conversionRate: 0.40 },
    "luxury-media": { target: Math.round(totalLeads * 0.08), label: "Luxury Lifestyle Media", conversionRate: 0.12 },
    "other": { target: Math.round(totalLeads * 0.05), label: "Walk-ins & Other", conversionRate: 0.10 },
  };
}

function buildFunnelMath() {
  return {
    target: TARGET_REVENUE,
    targetFormatted: "₹22 Cr",
    avgDeal: AVG_DEAL,
    avgDealFormatted: "₹25 L",
    dealsNeeded: DEALS_NEEDED,
    funnelTargets: {
      suspects: DEALS_NEEDED * 14,
      prospects: DEALS_NEEDED * 8,
      mqls: DEALS_NEEDED * 4,
      sqls: DEALS_NEEDED * 2,
      proposals: Math.round(DEALS_NEEDED * 1.4),
      negotiations: Math.round(DEALS_NEEDED * 1.15),
      won: DEALS_NEEDED,
    },
    conversionRates: {
      suspectToProspect: "57%",
      prospectToMql: "50%",
      mqlToSql: "50%",
      sqlToProposal: "70%",
      proposalToNegotiation: "82%",
      negotiationToWon: "77%",
    },
    channelTargets: generateChannelTargets(),
  };
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();

  const path = req.url?.split("?")[0]?.replace(/\/+$/, "") || "";

  if (req.method === "GET" && (path === "/api/leads" || path === "/api/leads/funnel")) {
    return res.status(200).json(buildFunnelMath());
  }

  if (req.method === "POST" && path === "/api/leads/score") {
    const data = req.body || {};
    const result = scoreLead(data);
    result.estimatedDealValue = estimatedDealValue(data);
    return res.status(200).json(result);
  }

  if (req.method === "POST" && path === "/api/leads/capture") {
    const data = req.body || {};
    if (!data.name || !data.phone) {
      return res.status(400).json({ error: "Name and phone are required." });
    }

    const scoring = scoreLead(data);
    const lead = {
      id: "MK-" + Date.now().toString(36).toUpperCase(),
      ...data,
      score: scoring.score,
      grade: scoring.grade,
      stage: scoring.qualification,
      estimatedDealValue: estimatedDealValue(data),
      createdAt: new Date().toISOString(),
      source: data.channel || "digital-content",
      tags: [],
    };

    if (scoring.score >= 70) lead.tags.push("hot-lead");
    if (data.timeline === "immediate" || data.timeline === "3-months") lead.tags.push("urgent");
    if (data.netWorth === "50cr+" || data.netWorth === "25cr-50cr") lead.tags.push("uhni");
    else if (data.netWorth === "10cr-25cr" || data.netWorth === "5cr-10cr") lead.tags.push("hni");

    return res.status(201).json({
      lead,
      scoring,
      nextAction: scoring.score >= 70
        ? "Schedule a personal consultation within 24 hours"
        : scoring.score >= 45
          ? "Send wellness kitchen lookbook and schedule a call within 48 hours"
          : "Add to nurture sequence with wellness content",
    });
  }

  if (req.method === "GET" && path === "/api/leads/channels") {
    return res.status(200).json({ channels: generateChannelTargets() });
  }

  if (req.method === "GET" && path === "/api/leads/scoring-model") {
    return res.status(200).json({ weights: SCORING, maxScore: 150, stages: FUNNEL_STAGES, channels: CHANNELS });
  }

  return res.status(404).json({ error: "Not found" });
}
