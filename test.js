
const express = require("express");
const cron = require("node-cron");

const app = express();
const PORT = process.env.PORT || 3000;

const CODEFORCES_API =
    "https://codeforces.com/api/contest.list";

const TIME_ZONE = "Asia/Kolkata";

// In-memory cache
let upcomingContests = [];
let lastUpdated = null;
let lastError = null;
let isRefreshing = false;

// Fetch contests from Codeforces
async function refreshContests() {
    if (isRefreshing) {
        console.log("Refresh already in progress.");
        return;
    }

    isRefreshing = true;

    try {
        console.log("Fetching contests from Codeforces...");

        const response = await fetch(CODEFORCES_API, {
            signal: AbortSignal.timeout(15000)
        });

        if (!response.ok) {
            throw new Error(`HTTP error: ${response.status}`);
        }

        const data = await response.json();

        if (data.status !== "OK") {
            throw new Error(
                data.comment || "Codeforces API request failed"
            );
        }

        const now = Math.floor(Date.now() / 1000);

        const contests = data.result
            .filter(contest =>
                contest.phase === "BEFORE" &&
                contest.startTimeSeconds > now
            )
            .sort(
                (a, b) =>
                    a.startTimeSeconds - b.startTimeSeconds
            )
            .map(contest => ({
                id: contest.id,
                name: contest.name,
                type: contest.type,
                startTimeSeconds: contest.startTimeSeconds,
                startTime: new Date(
                    contest.startTimeSeconds * 1000
                ).toISOString(),
                durationSeconds: contest.durationSeconds,
                durationHours: contest.durationSeconds / 3600,
                url: `https://codeforces.com/contests/${contest.id}`
            }));

        // Replace cache only after a successful API response.
        upcomingContests = contests;
        lastUpdated = new Date().toISOString();
        lastError = null;

        console.log(
            `Successfully cached ${contests.length} upcoming contests.`
        );
        console.log("Last updated:", lastUpdated);
    } catch (error) {
        lastError = error.message;
        console.error("Contest refresh failed:", error.message);

        // Preserve the previous successful cache.
    } finally {
        isRefreshing = false;
    }
}

// Fetch immediately when the server starts
refreshContests();

// Schedule daily refreshes at 12 AM and 6 PM IST
cron.schedule(
    "0 0,18 * * *",
    () => {
        refreshContests();
    },
    {
        timezone: TIME_ZONE
    }
);

// API: return cached upcoming contests
app.get("/api/contests", (req, res) => {
    res.set("Cache-Control", "no-store");

    res.json({
        success: true,
        count: upcomingContests.length,
        lastUpdated,
        contests: upcomingContests
    });
});

// API: check server and cache status
app.get("/health", (req, res) => {
    res.json({
        status: "running",
        lastUpdated,
        lastError,
        contestCount: upcomingContests.length
    });
});

app.listen(PORT, () => {
    console.log(`Backend running at http://localhost:${PORT}`);
    console.log("Scheduled refreshes: 12 AM and 6 PM IST");
});