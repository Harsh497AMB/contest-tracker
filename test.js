
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

        // Update cache only after a successful response.
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
    } finally {
        isRefreshing = false;
    }
}

// Fetch contests when the server starts
refreshContests();

// Refresh every day at 12 AM and 6 PM IST
cron.schedule(
    "0 0,18 * * *",
    refreshContests,
    {
        timezone: TIME_ZONE
    }
);

// API: get upcoming contests
app.get("/api/contests", (req, res) => {
    res.set("Cache-Control", "no-store");

    res.json({
        success: true,
        count: upcomingContests.length,
        lastUpdated,
        contests: upcomingContests
    });
});

// API: manually refresh contests
app.post("/api/contests/refresh", async (req, res) => {
    if (isRefreshing) {
        return res.status(409).json({
            success: false,
            message: "Refresh already in progress."
        });
    }

    await refreshContests();

    if (lastError) {
        return res.status(502).json({
            success: false,
            message: "Failed to refresh contests.",
            error: lastError,
            lastUpdated
        });
    }

    res.json({
        success: true,
        message: "Contests refreshed successfully.",
        count: upcomingContests.length,
        lastUpdated,
        contests: upcomingContests
    });
});

// API: server health
app.get("/health", (req, res) => {
    res.json({
        status: "running",
        lastUpdated,
        lastError,
        contestCount: upcomingContests.length,
        refreshing: isRefreshing
    });
});

// Start server for Render
app.listen(PORT, "0.0.0.0", () => {
    console.log(`Backend running on port ${PORT}`);
    console.log("Scheduled refreshes: 12 AM and 6 PM IST");
});
