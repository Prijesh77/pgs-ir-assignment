# Evaluation (461 test queries)

## All queries

| Run | P@10 | R@10 | MAP | MRR | nDCG@10 | ms/query |
|---|---:|---:|---:|---:|---:|---:|
| Boolean (AND) | 0.341 | 0.742 | 0.623 | 0.616 | 0.659 | 0.1 |
| TF-IDF | 0.293 | 0.723 | 0.652 | 0.637 | 0.669 | 1.9 |
| BM25F | 0.296 | 0.729 | 0.643 | 0.583 | 0.657 | 1.4 |
| TF-IDF + expansion | 0.299 | 0.861 | 0.789 | 0.763 | 0.804 | 3.6 |
| BM25F + expansion | 0.313 | 0.876 | 0.803 | 0.738 | 0.814 | 2.6 |
| Hybrid RRF + expansion | 0.296 | 0.858 | 0.811 | 0.816 | 0.824 | 6.0 |
| BM25F + expansion, no segmentation | 0.319 | 0.688 | 0.653 | 0.564 | 0.658 | 2.6 |

## T1 locals by district (EN) (77 queries)

| Run | P@10 | R@10 | MAP | MRR | nDCG@10 |
|---|---:|---:|---:|---:|---:|
| Boolean (AND) | 0.851 | 0.918 | 0.997 | 0.994 | 0.997 |
| TF-IDF | 0.682 | 0.762 | 0.717 | 0.606 | 0.706 |
| BM25F | 0.661 | 0.748 | 0.654 | 0.510 | 0.648 |
| TF-IDF + expansion | 0.696 | 0.775 | 0.705 | 0.619 | 0.711 |
| BM25F + expansion | 0.677 | 0.765 | 0.669 | 0.491 | 0.661 |
| Hybrid RRF + expansion | 0.679 | 0.765 | 0.693 | 0.609 | 0.694 |
| BM25F + expansion, no segmentation | 0.796 | 0.874 | 0.765 | 0.480 | 0.778 |

## T2 locals by district (NE) (77 queries)

| Run | P@10 | R@10 | MAP | MRR | nDCG@10 |
|---|---:|---:|---:|---:|---:|
| Boolean (AND) | 0.852 | 0.919 | 1.000 | 1.000 | 1.000 |
| TF-IDF | 0.793 | 0.862 | 0.882 | 0.909 | 0.900 |
| BM25F | 0.804 | 0.879 | 0.793 | 0.576 | 0.809 |
| TF-IDF + expansion | 0.727 | 0.806 | 0.768 | 0.696 | 0.769 |
| BM25F + expansion | 0.800 | 0.874 | 0.791 | 0.582 | 0.807 |
| Hybrid RRF + expansion | 0.723 | 0.801 | 0.835 | 0.948 | 0.853 |
| BM25F + expansion, no segmentation | 0.803 | 0.878 | 0.790 | 0.567 | 0.806 |

## T3 districts by province (7 queries)

| Run | P@10 | R@10 | MAP | MRR | nDCG@10 |
|---|---:|---:|---:|---:|---:|
| Boolean (AND) | 0.871 | 0.818 | 0.791 | 0.476 | 0.774 |
| TF-IDF | 0.014 | 0.011 | 0.006 | 0.025 | 0.009 |
| BM25F | 0.357 | 0.369 | 0.470 | 0.448 | 0.363 |
| TF-IDF + expansion | 0.014 | 0.011 | 0.004 | 0.031 | 0.012 |
| BM25F + expansion | 0.343 | 0.351 | 0.435 | 0.393 | 0.330 |
| Hybrid RRF + expansion | 0.014 | 0.011 | 0.104 | 0.092 | 0.020 |
| BM25F + expansion, no segmentation | 0.800 | 0.761 | 0.734 | 0.476 | 0.703 |

## T4 local government by name (100 queries)

| Run | P@10 | R@10 | MAP | MRR | nDCG@10 |
|---|---:|---:|---:|---:|---:|
| Boolean (AND) | 0.104 | 1.000 | 0.494 | 0.490 | 0.626 |
| TF-IDF | 0.104 | 1.000 | 0.844 | 0.842 | 0.883 |
| BM25F | 0.104 | 1.000 | 0.846 | 0.844 | 0.884 |
| TF-IDF + expansion | 0.104 | 1.000 | 0.962 | 0.962 | 0.972 |
| BM25F + expansion | 0.104 | 1.000 | 1.000 | 1.000 | 1.000 |
| Hybrid RRF + expansion | 0.104 | 1.000 | 0.995 | 0.995 | 0.996 |
| BM25F + expansion, no segmentation | 0.104 | 1.000 | 1.000 | 1.000 | 1.000 |

## T5 name with a typo (100 queries)

| Run | P@10 | R@10 | MAP | MRR | nDCG@10 |
|---|---:|---:|---:|---:|---:|
| Boolean (AND) | 0.000 | 0.000 | 0.000 | 0.000 | 0.000 |
| TF-IDF | 0.008 | 0.080 | 0.057 | 0.057 | 0.062 |
| BM25F | 0.008 | 0.080 | 0.057 | 0.057 | 0.062 |
| TF-IDF + expansion | 0.078 | 0.750 | 0.702 | 0.702 | 0.714 |
| BM25F + expansion | 0.078 | 0.750 | 0.725 | 0.725 | 0.732 |
| Hybrid RRF + expansion | 0.078 | 0.750 | 0.720 | 0.720 | 0.728 |
| BM25F + expansion, no segmentation | 0.078 | 0.750 | 0.740 | 0.740 | 0.743 |

## T6 website by name (100 queries)

| Run | P@10 | R@10 | MAP | MRR | nDCG@10 |
|---|---:|---:|---:|---:|---:|
| Boolean (AND) | 0.095 | 0.950 | 0.782 | 0.782 | 0.822 |
| TF-IDF | 0.100 | 1.000 | 0.872 | 0.872 | 0.903 |
| BM25F | 0.100 | 1.000 | 0.917 | 0.917 | 0.937 |
| TF-IDF + expansion | 0.100 | 1.000 | 0.840 | 0.840 | 0.878 |
| BM25F + expansion | 0.100 | 1.000 | 0.823 | 0.823 | 0.866 |
| Hybrid RRF + expansion | 0.100 | 1.000 | 0.841 | 0.841 | 0.880 |
| BM25F + expansion, no segmentation | 0.002 | 0.020 | 0.020 | 0.020 | 0.020 |
