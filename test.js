
const express = require("express");
const cron = require("node-cron");

const app = express();
const PORT = process.env.PORT || 3000;

const CODEFORCES_API =
    "https://codeforces.com/api/contest.list";

const TIME_ZONE = "Asia/Kolkata";
const THIRTY_DAYS_SECONDS = 30 * 24 * 60 * 60;

// In-memory cache
let contestsCache = [];
let lastUpdated = null;
let lastError = null;
let isRefreshing = false;

// Fetch recent finished contests and all upcoming contests
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
        const cutoff = now - THIRTY_DAYS_SECONDS;

        const contests = data.result
            .filter(contest => {
                // Include every upcoming contest.
                if (contest.phase === "BEFORE") {
                    return contest.startTimeSeconds > now;
                }

                // Include running contests too.
                if (contest.phase === "CODING") {
                    return true;
                }

                // Include finished contests that started
                // within the last 30 days.
                if (contest.phase === "FINISHED") {
                    return (
                        contest.startTimeSeconds >= cutoff &&
                        contest.startTimeSeconds <= now
                    );
                }

                return false;
            })
            .sort((a, b) =>
                a.startTimeSeconds - b.startTimeSeconds
            )
            .map(contest => ({
                id: contest.id,
                name: contest.name,
                type: contest.type,
                phase: contest.phase,
                startTimeSeconds: contest.startTimeSeconds,
                startTime: new Date(
                    contest.startTimeSeconds * 1000
                ).toISOString(),
                durationSeconds: contest.durationSeconds,
                durationHours: contest.durationSeconds / 3600,
                url: `https://codeforces.com/contests/${contest.id}`
            }));

        // Update cache only after a successful response.
        contestsCache = contests;
        lastUpdated = new Date().toISOString();
        lastError = null;

        const upcomingCount = contests.filter(
            c => c.phase === "BEFORE"
        ).length;

        const finishedCount = contests.filter(
            c => c.phase === "FINISHED"
        ).length;

        console.log(
            `Cached ${contests.length} contests: ` +
            `${upcomingCount} upcoming, ${finishedCount} finished.`
        );
        console.log("Last updated:", lastUpdated);
    } catch (error) {
        lastError = error.message;
        console.error("Contest refresh failed:", error.message);

        // Keep the previous successful cache on failure.
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
    { timezone: TIME_ZONE }
);

// API: get recent, running, and upcoming contests
app.get("/api/contests", (req, res) => {
    res.set("Cache-Control", "no-store");

    res.json({
        success: true,
        count: contestsCache.length,
        lastUpdated,
        contests: contestsCache
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
        count: contestsCache.length,
        lastUpdated,
        contests: contestsCache
    });
});

// API: server health
app.get("/health", (req, res) => {
    res.json({
        status: "running",
        lastUpdated,
        lastError,
        contestCount: contestsCache.length,
        refreshing: isRefreshing
    });
});

// Start server for Render
app.listen(PORT, "0.0.0.0", () => {
    console.log(`Backend running on port ${PORT}`);
    console.log("Scheduled refreshes: 12 AM and 6 PM IST");
});
