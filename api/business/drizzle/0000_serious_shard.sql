CREATE TABLE IF NOT EXISTS "analysis_runs" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" serial NOT NULL,
	"ticker" varchar(20) NOT NULL,
	"market" varchar(10) NOT NULL,
	"depth" varchar(20) NOT NULL,
	"status" varchar(20) DEFAULT 'pending' NOT NULL,
	"result" text,
	"layer_outputs" text,
	"llm_provider" varchar(50),
	"created_at" timestamp DEFAULT now(),
	"completed_at" timestamp
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "backtest_runs" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" serial NOT NULL,
	"strategy_name" varchar(100) NOT NULL,
	"strategy_code" text NOT NULL,
	"strategy_type" varchar(20) NOT NULL,
	"config" text NOT NULL,
	"status" varchar(20) DEFAULT 'pending' NOT NULL,
	"metrics" text,
	"equity_curve" text,
	"trades" text,
	"error" text,
	"created_at" timestamp DEFAULT now(),
	"completed_at" timestamp
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "users" (
	"id" serial PRIMARY KEY NOT NULL,
	"email" varchar(255) NOT NULL,
	"username" varchar(50) NOT NULL,
	"password" varchar(255) NOT NULL,
	"role" varchar(20) DEFAULT 'user' NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "users_email_unique" UNIQUE("email"),
	CONSTRAINT "users_username_unique" UNIQUE("username")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "watchlist_groups" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" serial NOT NULL,
	"name" varchar(100) NOT NULL,
	"description" text,
	"is_default" boolean DEFAULT false,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "watchlist_items" (
	"id" serial PRIMARY KEY NOT NULL,
	"group_id" serial NOT NULL,
	"symbol" varchar(20) NOT NULL,
	"name" varchar(100),
	"type" varchar(20) DEFAULT 'stock',
	"exchange" varchar(20),
	"notes" text,
	"sort_order" integer DEFAULT 0,
	"market" varchar(20),
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "stock_quote_history" (
	"id" serial PRIMARY KEY NOT NULL,
	"symbol" varchar(50) NOT NULL,
	"market" varchar(20) NOT NULL,
	"interval" varchar(10) NOT NULL,
	"open" numeric(12, 4),
	"high" numeric(12, 4),
	"low" numeric(12, 4),
	"close" numeric(12, 4),
	"volume" bigint,
	"amount" bigint,
	"change" numeric(12, 4),
	"change_percent" numeric(8, 4),
	"timestamp" timestamp with time zone NOT NULL,
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "symbol_interval_timestamp_unique" UNIQUE("symbol","interval","timestamp")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "stock_quotes" (
	"symbol" varchar(50) PRIMARY KEY NOT NULL,
	"market" varchar(20) NOT NULL,
	"name" varchar(100),
	"type" varchar(20),
	"exchange" varchar(50),
	"interval" varchar(10) NOT NULL,
	"open" numeric(12, 4),
	"high" numeric(12, 4),
	"low" numeric(12, 4),
	"close" numeric(12, 4),
	"volume" bigint,
	"amount" bigint,
	"change" numeric(12, 4),
	"change_percent" numeric(8, 4),
	"turnover_rate" numeric(8, 4),
	"prev_close" numeric(12, 4),
	"timestamp" timestamp with time zone NOT NULL,
	"data_date" timestamp NOT NULL,
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "symbol_interval_unique" UNIQUE("symbol","interval")
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "analysis_runs" ADD CONSTRAINT "analysis_runs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "backtest_runs" ADD CONSTRAINT "backtest_runs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "watchlist_groups" ADD CONSTRAINT "watchlist_groups_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "watchlist_items" ADD CONSTRAINT "watchlist_items_group_id_watchlist_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."watchlist_groups"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "stock_quote_history_symbol_idx" ON "stock_quote_history" USING btree ("symbol");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "stock_quote_history_interval_idx" ON "stock_quote_history" USING btree ("interval");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "stock_quote_history_timestamp_idx" ON "stock_quote_history" USING btree ("timestamp");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "stock_quotes_market_idx" ON "stock_quotes" USING btree ("market");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "stock_quotes_interval_idx" ON "stock_quotes" USING btree ("interval");