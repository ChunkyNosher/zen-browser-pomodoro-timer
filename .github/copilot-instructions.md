# GitHub Copilot Instructions for zen-browser-pomodoro-timer

When figuring out what changes need to be made, make sure that you use context7 and perplexity while implementing the fixes and changes and also use the tools to make sure that all of
the code in the repo follows the correct format for Zen Browser mods. Make sure that you also implement the changes for both the uc.js file and the .css file.

YOU ARE NOT WORKING ON A FIREFOX EXTENSION, YOU ARE WORKING ON A ZEN BROWSER MOD. ALSO, DO NOT SAY THAT THE ISSUES I DESCRIBED ARE ALREADY FIXED,
BECAUSE IF IT LOOKS LIKE IT'S IMPLEMENTED PROPERLY BUT I SAY THAT THERE'S AN ISSUE, THEN IT'S MOST LIKELY IMPLEMENTED WRONG.
Also, if there are log files that I explicitly list in a prompt/comment, make sure to find those logs files in the repo and diagnose
what's actually going on with the bugged behaviors and issues, and also try and identify any other bugged behaviors
in your parsing of the logs that I didn't already explicitly list out.

Make sure that you delegate all of the coding work to the subagent in this repo and MAKE SURE
TO RUN THE SUBAGENT MULTIPLE TIMES TO ADDRESS SPECIFIC CATEGORIES OF ISSUES RATHER THAN JUST DOING EVERYTHING IN ONE PASS.
When the subagent is done, make sure to double-check its work and don't just assume that it's correct.
Also make sure that you run the Copilot code review multiple times before finishing your work.

Also, after the changes are done, I want you to run the CodeScene MCP and refactor the code if there's any issue detected with CodeScene.
