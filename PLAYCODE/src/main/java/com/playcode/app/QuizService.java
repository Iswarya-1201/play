package com.playcode.app;

import org.springframework.stereotype.Service;
import jakarta.annotation.PostConstruct;
import java.io.*;
import java.nio.charset.StandardCharsets;
import java.util.*;
import java.util.concurrent.ConcurrentHashMap;
import java.util.stream.Collectors;

@Service
public class QuizService {
    private final List<Question> questions = new ArrayList<>();
    // Concurrent maps make simultaneous online users/challenges safe to access across request threads.
    final Map<String, Player> online = new ConcurrentHashMap<>();
    final Map<String, Challenge> challenges = new ConcurrentHashMap<>();
    final Map<String, Match> matches = new ConcurrentHashMap<>();

    @PostConstruct
    public void loadQuestions() {
        try (InputStream in = getClass().getResourceAsStream("/questions.csv")) {
            if (in == null) throw new IllegalStateException("questions.csv was not found in resources");
            try (BufferedReader br = new BufferedReader(new InputStreamReader(in, StandardCharsets.UTF_8))) {
                String line = br.readLine(); // header
                while ((line = br.readLine()) != null) {
                    List<String> c = parseCsv(line);
                    if (c.size() < 10) continue;
                    questions.add(new Question(Long.parseLong(c.get(0)), c.get(1), c.get(2), c.get(3), c.get(4),
                            c.get(5), c.get(6), c.get(7), c.get(8), c.get(9).trim().toUpperCase()));
                }
            }
        } catch (Exception e) { throw new RuntimeException("Could not load question bank: " + e.getMessage(), e); }
        System.out.println("PLAYCODE loaded " + questions.size() + " questions.");
    }
    private List<String> parseCsv(String line) {
        List<String> out = new ArrayList<>(); StringBuilder cur = new StringBuilder(); boolean quoted=false;
        for (int i=0;i<line.length();i++) {
            char ch=line.charAt(i);
            if(ch=='"' && quoted && i+1<line.length() && line.charAt(i+1)=='"'){cur.append('"');i++;}
            else if(ch=='"') quoted=!quoted;
            else if(ch==',' && !quoted){out.add(cur.toString());cur.setLength(0);}
            else cur.append(ch);
        }
        out.add(cur.toString()); return out;
    }
    public List<String> languages() {
        return questions.stream().map(Question::subject).distinct().sorted().collect(Collectors.toList());
    }
    public List<String> topics(String language) {
        return questions.stream().filter(q->q.subject().equalsIgnoreCase(language))
                .map(Question::topic).distinct().sorted().collect(Collectors.toList());
    }
    public List<Map<String,Object>> publicQuestions(String language, String topic, int count) {
        List<Question> pool = questions.stream()
                .filter(q->q.subject().equalsIgnoreCase(language) && q.topic().equalsIgnoreCase(topic))
                .collect(Collectors.toCollection(ArrayList::new));
        Collections.shuffle(pool);
        return pool.stream().limit(Math.max(1,Math.min(count,20))).map(q->{
            Map<String,Object> m=new LinkedHashMap<>(); m.put("id",q.id());m.put("subject",q.subject());m.put("topic",q.topic());
            m.put("difficulty",q.difficulty());m.put("question",q.question());m.put("optionA",q.optionA());
            m.put("optionB",q.optionB());m.put("optionC",q.optionC());m.put("optionD",q.optionD());return m;
        }).collect(Collectors.toList());
    }
    public List<Question> rawQuestionsForGrade(long id) { return questions.stream().filter(q -> q.id() == id).toList(); }
    public List<Question> rawQuestions(String language, String topic, int count) {
        List<Question> pool=questions.stream().filter(q->q.subject().equalsIgnoreCase(language)&&q.topic().equalsIgnoreCase(topic))
                .collect(Collectors.toCollection(ArrayList::new));
        Collections.shuffle(pool); return pool.stream().limit(Math.min(count,20)).collect(Collectors.toList());
    }
    static class Player { String username; long lastSeen; Player(String u){username=u;touch();} void touch(){lastSeen=System.currentTimeMillis();} }
    static class Challenge { String id, from, to, status="PENDING", matchId, language, topic; long created=System.currentTimeMillis(); Challenge(String i,String f,String t){id=i;from=f;to=t;} }
    static class Match {
        String id, player1, player2, language, topic, status="COUNTDOWN";
        long startAt;
        List<Question> questions; Map<String,Map<Long,String>> answers=new ConcurrentHashMap<>();
        Map<String,Integer> scores=new ConcurrentHashMap<>(); Set<String> submitted=ConcurrentHashMap.newKeySet();
        Match(String id,String p1,String p2,String lang,String topic,List<Question> qs){this.id=id;player1=p1;player2=p2;language=lang;this.topic=topic;questions=qs;startAt=System.currentTimeMillis()+5000L;}
    }
}
