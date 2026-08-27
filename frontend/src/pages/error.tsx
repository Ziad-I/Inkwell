import { Link } from "react-router";
import { ButtonLink } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { AlertTriangle, Home } from "lucide-react";

export default function ErrorPage() {
  return (
    <Card className="mx-auto w-full max-w-md">
      <CardHeader className="text-center">
        <div className="w-12 h-12 bg-destructive/10 rounded-lg flex items-center justify-center mx-auto mb-4">
          <AlertTriangle className="w-6 h-6 text-destructive" />
        </div>
        <CardTitle>Oops! Something went wrong</CardTitle>
        <CardDescription>
          An unexpected error occurred, This page doesn't exist!
        </CardDescription>
      </CardHeader>
      <CardContent className="text-center">
        <ButtonLink className="w-full" render={<Link to="/" />}>
          <Home className="w-4 h-4 mr-2" />
          Back to Home
        </ButtonLink>
      </CardContent>
    </Card>
  );
}
