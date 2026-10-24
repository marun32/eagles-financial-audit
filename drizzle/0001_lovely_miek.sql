CREATE TABLE `attendance` (
	`team_season_id` text NOT NULL,
	`match_id` text NOT NULL,
	`player_id` text NOT NULL,
	PRIMARY KEY(`match_id`, `player_id`),
	FOREIGN KEY (`team_season_id`) REFERENCES `team_seasons`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`match_id`) REFERENCES `matches`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`player_id`) REFERENCES `players`(`id`) ON UPDATE no action ON DELETE no action
);
