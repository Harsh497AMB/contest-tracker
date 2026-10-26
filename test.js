
async function fetchContests() {
    try {
        const response = await fetch(
            "https://codeforces.com/api/contest.list"
        );

        const data = await response.json();

        if (!response.ok || data.status !== "OK") {
            throw new Error(data.comment || "API request failed");
        }

        const contests = data.result
            .filter(contest => contest.phase === "BEFORE")
            .sort((a, b) => a.startTimeSeconds - b.startTimeSeconds);

        if (contests.length === 0) {
            console.log("No upcoming contests found.");
            return;
        }

        console.log("\n===== UPCOMING CODEFORCES CONTESTS =====\n");

        for (const contest of contests) {
            console.log("Name:", contest.name);

            console.log(
                "Start Time:",
                new Date(contest.startTimeSeconds * 1000)
                    .toLocaleString("en-IN", {
                        timeZone: "Asia/Kolkata"
                    })
            );

            console.log(
                "Duration:",
                contest.durationSeconds / 3600,
                "hours"
            );

            console.log(
                "URL:",
                `https://codeforces.com/contests/${contest.id}`
            );

            console.log("--------------------------------------");
        }
    } catch (error) {
        console.error("Error fetching contests:", error.message);
    }
}

fetchContests();