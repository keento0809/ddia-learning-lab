-- T-303(バッジ): 02_詳細設計書.md §2.1(badges.criteria jsonb)/§3.1・§4.4の
-- 例("part1-complete"/"part2-complete")で言及されているPart修了バッジのカタログを
-- データ投入する。評価ロジックはlib/badges/{criteria,evaluate}.ts(part_complete)。
INSERT INTO "badges" ("slug", "criteria") VALUES
  ('part1-complete', '{"type": "part_complete", "part": "I"}'),
  ('part2-complete', '{"type": "part_complete", "part": "II"}'),
  ('part3-complete', '{"type": "part_complete", "part": "III"}');
