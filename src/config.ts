// src/config.ts
export default {
  name: "Ian Xavier Sabia",
  title: "Software Engineer",
  description:
    "Modern, results-driven developer passionate about building efficient, scalable, and visually appealing applications.",
  accentColor: "#2563eb", // Tailwind blue-600

  social: {
    email: "iansabia@gmail.com",
    linkedin: "https://linkedin.com/in/iansabia",
    github: "https://github.com/Iansabia",
  },

  aboutMe: `I’m a dedicated software engineer with a strong focus on clean code, responsive design, and practical problem-solving. I enjoy combining creativity and technology to deliver engaging, scalable, and performance-oriented solutions.`,

  skills: [
    "JavaScript",
    "TypeScript",
    "React",
    "Next.js",
    "Node.js",
    "Express",
    "Python",
    "Tailwind CSS",
    "Astro",
    "SQL",
    "MongoDB",
    "Git",
    "REST APIs",
  ],

  projects: [
    {
      name: "Personal Portfolio",
      description:
        "A modern developer portfolio built with Astro and Tailwind CSS to showcase projects and experience.",
      link: "https://iansabia.github.io",
      skills: ["Astro", "Tailwind CSS", "TypeScript"],
    },
    {
      name: "TaskFlow",
      description:
        "A full-stack task management app enabling users to organize, track, and prioritize daily work efficiently.",
      link: "https://github.com/Iansabia/taskflow",
      skills: ["React", "Node.js", "Express", "MongoDB"],
    },
    {
      name: "WeatherNow",
      description:
        "Responsive weather dashboard displaying real-time weather data using the OpenWeather API.",
      link: "https://github.com/Iansabia/weather-app",
      skills: ["JavaScript", "API Integration", "Tailwind CSS"],
    },
  ],

  experience: [
    {
      company: "Freelance Developer",
      title: "Software Engineer",
      dateRange: "2022 – Present",
      bullets: [
        "Develop responsive websites and web apps tailored to client needs.",
        "Implement optimized UI/UX with Astro, React, and Tailwind CSS.",
        "Collaborate with clients to translate ideas into scalable digital products.",
      ],
    },
    {
      company: "University Projects",
      title: "Full-Stack Developer",
      dateRange: "2020 – 2022",
      bullets: [
        "Built full-stack applications using React and Node.js for academic and team projects.",
        "Applied best practices in responsive design and version control using Git and GitHub.",
      ],
    },
  ],

  education: [
    {
      school: "California State University, Fullerton",
      degree: "Bachelor of Science in Computer Science",
      dateRange: "2020 – 2024",
      achievements: [
        "Focused on software engineering, web development, and data structures.",
        "Completed multiple projects involving front-end frameworks and cloud deployment.",
      ],
    },
  ],
};
