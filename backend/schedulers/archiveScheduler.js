const cron = require('node-cron');

const { runWeeklyArchiveJob } = require('../services/archiveService');
const { isDbConfigured } = require('../db');

const WEEKLY_ARCHIVE_CRON = process.env.WEEKLY_ARCHIVE_CRON || '0 0 * * 0';
const WEEKLY_ARCHIVE_TIMEZONE = process.env.WEEKLY_ARCHIVE_TIMEZONE || process.env.TZ || 'Asia/Kolkata';

let weeklyArchiveTask = null;

function startArchiveScheduler() {
    if (!isDbConfigured() || weeklyArchiveTask) {
        return weeklyArchiveTask;
    }

    weeklyArchiveTask = cron.schedule(
        WEEKLY_ARCHIVE_CRON,
        async () => {
            try {
                const result = await runWeeklyArchiveJob();
                if (!result.archived) {
                    console.log(`[Archive] Weekly job skipped: ${result.reason}`);
                }
            } catch (error) {
                console.error('[Archive] Scheduled weekly archive failed:', error.message);
            }
        },
        {
            timezone: WEEKLY_ARCHIVE_TIMEZONE,
        }
    );

    console.log(
        `[Archive] Scheduler enabled: cron="${WEEKLY_ARCHIVE_CRON}", timezone="${WEEKLY_ARCHIVE_TIMEZONE}"`
    );

    return weeklyArchiveTask;
}

module.exports = {
    WEEKLY_ARCHIVE_CRON,
    startArchiveScheduler,
};
