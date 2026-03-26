import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

type Sample = {
  title: string;
  description: string;
  thumbnail: string;
  href: string;
};

type Props = {
  samples: Sample[];
};

export default function SampleGrid({ samples }: Props) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
      {samples.map((sample) => (
        <a key={sample.href} href={sample.href} className="group block focus:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded-xl">
          <Card className="overflow-hidden transition-all duration-200 group-hover:shadow-md group-hover:ring-primary/50 h-full">
            <div className="overflow-hidden">
              <img
                src={sample.thumbnail}
                alt={sample.title}
                className="w-full h-40 object-cover group-hover:scale-105 transition-transform duration-300"
              />
            </div>
            <CardHeader>
              <CardTitle>{sample.title}</CardTitle>
              <CardDescription>{sample.description}</CardDescription>
            </CardHeader>
            <CardContent>
              <Button variant="outline" size="sm" className="w-full" tabIndex={-1}>
                デモを見る →
              </Button>
            </CardContent>
          </Card>
        </a>
      ))}
    </div>
  );
}
